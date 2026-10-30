import mongoose from 'mongoose';
import Job from './job.model.js';
import Quote from './quote.model.js';
import { validateRatingInput, writeRating } from '../trust/ratings.js';
import { HttpError } from '../httpError.js';
import { recordDispute, release, sync } from '../payments/escrow.js';

export { HttpError };

// Status moves that don't move money (Fig. 5). The worker can start only once
// the client has paid into escrow (FR-09). Funding, confirming (which releases
// escrow) and resolving disputes are in ../payments/escrow.js.
const TRANSITIONS = {
  start: { from: ['escrow_held'], to: 'in_progress', actor: 'worker', stamp: 'startedAt' },
  complete: { from: ['in_progress'], to: 'awaiting_confirmation', actor: 'worker', stamp: 'workerCompletedAt' },
  // A dispute locks the escrowed money until an admin resolves it.
  dispute: { from: ['escrow_held', 'in_progress', 'awaiting_confirmation'], to: 'disputed', actor: 'either', stamp: 'disputedAt' }
};

const actorFilter = (actor, userId) => {
  if (actor === 'worker') return { worker: userId };
  if (actor === 'client') return { client: userId };
  return { $or: [{ client: userId }, { worker: userId }] };
};

/**
 * Applies a lifecycle action as one conditional update, so a double tap or
 * two racing requests can't move a job twice. On failure, works out whether
 * the job is missing, not the caller's, or in the wrong state. Pass a
 * `session` to make the move part of a transaction.
 */
export async function transition(jobId, action, user, session = null) {
  const rule = TRANSITIONS[action];
  if (!rule) throw new HttpError(400, `Unknown action: ${action}`);
  if (!mongoose.isValidObjectId(jobId)) throw new HttpError(404, 'Job not found');

  const update = { status: rule.to, [rule.stamp]: new Date() };
  if (action === 'dispute') update.disputedBy = user._id;

  const job = await Job.findOneAndUpdate(
    { _id: jobId, status: { $in: rule.from }, ...actorFilter(rule.actor, user._id) },
    update,
    { new: true, session }
  );
  if (job) return job;

  const existing = await Job.findById(jobId).session(session).lean();
  if (!existing) throw new HttpError(404, 'Job not found');
  const isClient = String(existing.client) === String(user._id);
  const isWorker = String(existing.worker) === String(user._id);
  const allowed = rule.actor === 'client' ? isClient : rule.actor === 'worker' ? isWorker : isClient || isWorker;
  if (!allowed) throw new HttpError(403, 'This is not your job');
  throw new HttpError(409, `Can't ${action} a job that is ${existing.status.replaceAll('_', ' ')}`);
}

/** Either party reports a problem; the dispute and its ledger record are one unit. */
export async function dispute(jobId, user) {
  return mongoose.connection.transaction(async session => {
    const job = await transition(jobId, 'dispute', user, session);
    await recordDispute(job, user, session);
    return job;
  });
}

/**
 * A worker's one response to an open job (FR-05): accept the proposed price
 * or counter it, optionally asking for a materials deposit.
 */
export async function respond(jobId, worker, { amount, depositAmount = 0 }) {
  if (!mongoose.isValidObjectId(jobId)) throw new HttpError(404, 'Job not found');
  const job = await Job.findById(jobId).lean();
  if (!job) throw new HttpError(404, 'Job not found');
  if (job.status !== 'open') throw new HttpError(409, 'This job is no longer taking responses');
  if (!(worker.skills || []).includes(job.category) || worker.area !== job.area) {
    throw new HttpError(403, 'This job is outside your skills or area');
  }

  const price = Number(amount ?? job.proposedPrice);
  const deposit = Number(depositAmount || 0);
  if (!Number.isInteger(price) || price < 1) throw new HttpError(400, 'Price must be a whole number of RWF');
  // Optional materials deposit set by the worker; must be less than the price.
  if (!Number.isInteger(deposit) || deposit < 0 || (deposit > 0 && deposit >= price)) {
    throw new HttpError(400, 'The materials amount must be less than the price');
  }

  try {
    return await Quote.create({
      job: job._id,
      worker: worker._id,
      amount: price,
      isCounter: price !== job.proposedPrice,
      depositAmount: deposit
    });
  } catch (err) {
    if (err.code === 11000) throw new HttpError(409, 'You have already responded to this job');
    throw err;
  }
}

/**
 * The client picks one response (FR-05b): fixes the agreed price and deposit,
 * assigns the worker, and declines every other response.
 */
export async function selectResponse(jobId, quoteId, client) {
  if (!mongoose.isValidObjectId(jobId) || !mongoose.isValidObjectId(quoteId)) {
    throw new HttpError(404, 'Job or response not found');
  }
  const quote = await Quote.findOne({ _id: quoteId, job: jobId }).lean();
  if (!quote) throw new HttpError(404, 'Response not found for this job');

  const job = await Job.findOneAndUpdate(
    { _id: jobId, client: client._id, status: 'open' },
    {
      status: 'quote_accepted',
      worker: quote.worker,
      agreedPrice: quote.amount,
      depositAmount: quote.depositAmount,
      acceptedAt: new Date()
    },
    { new: true }
  );
  if (!job) {
    const existing = await Job.findById(jobId).lean();
    if (!existing) throw new HttpError(404, 'Job not found');
    if (String(existing.client) !== String(client._id)) throw new HttpError(403, 'This is not your job');
    throw new HttpError(409, 'A worker has already been chosen for this job');
  }

  await Quote.updateOne({ _id: quote._id }, { status: 'accepted' });
  await Quote.updateMany({ job: job._id, _id: { $ne: quote._id } }, { status: 'declined' });
  return job;
}

const parseRating = body => {
  const input = { score: Number(body.score), comment: body.comment ?? '', referredFlag: Boolean(body.referred) };
  try {
    validateRatingInput(input);
  } catch (err) {
    throw new HttpError(400, err.message);
  }
  return input;
};

// Ratings need the job confirmed by the client AND its escrow released to
// the worker. A payout still in flight is checked with the provider first.
const settledJob = async (jobId, user, role) => {
  if (!mongoose.isValidObjectId(jobId)) throw new HttpError(404, 'Job not found');
  let job = await Job.findById(jobId).lean();
  if (!job) throw new HttpError(404, 'Job not found');
  if (String(job[role]) !== String(user._id)) throw new HttpError(403, 'This is not your job');
  if (job.escrow?.pending) job = await sync(job._id);
  return job;
};
const isSettled = job => job.status === 'completed' && job.escrow?.status === 'released';

/**
 * Client confirms completion and rates the worker in one request (FR-12):
 * the rating is required, and "vouch" sets the referred flag (FR-17).
 * Confirming releases escrow to the worker; the rating is written once the
 * payout has succeeded. Returns { job, myRating }: myRating is null while the
 * payout is still in flight (send the same request again to rate). If the
 * rating can't be written, the job stays confirmed and paid, and sending the
 * request again writes it.
 */
export async function confirmAndRate(jobId, client, body) {
  const { score, comment, referredFlag } = parseRating(body);
  let job = await settledJob(jobId, client, 'client');
  if (job.status === 'awaiting_confirmation') job = await release(jobId, client);
  if (!isSettled(job)) {
    if (job.escrow?.status === 'releasing') return { job, myRating: null };
    throw new HttpError(409, job.status === 'awaiting_confirmation'
      ? "The payment to the worker didn't go through. The money is still held. Please try again."
      : `Can't confirm a job that is ${job.status.replaceAll('_', ' ')}`);
  }
  try {
    const myRating = await writeRating({ job: job._id, fromUser: client._id, toUser: job.worker, score, referredFlag, comment });
    return { job, myRating };
  } catch (err) {
    if (err.code === 11000) throw new HttpError(409, 'You have already rated this worker for this job');
    throw err;
  }
}

/**
 * Worker rates the client (FR-12b), once the client has confirmed and the
 * escrow has been released to the worker.
 */
export async function rateClient(jobId, worker, body) {
  const { score, comment } = parseRating(body);
  const job = await settledJob(jobId, worker, 'worker');
  if (!isSettled(job)) throw new HttpError(409, 'You can rate the client once they have confirmed the job and the payment has been released to you');
  try {
    return await writeRating({ job: job._id, fromUser: worker._id, toUser: job.client, score, comment });
  } catch (err) {
    if (err.code === 11000) throw new HttpError(409, 'You have already rated this client for this job');
    throw err;
  }
}
