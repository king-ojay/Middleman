import mongoose from 'mongoose';
import Job from './job.model.js';
import Quote from './quote.model.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Status moves after a response has been chosen (Fig. 5). Phase 1 has no
// escrow, so the worker starts the job directly; Phase 3 replaces `start`
// with escrow funding (quote_accepted -> escrow_held -> in_progress, FR-09).
const TRANSITIONS = {
  start: { from: ['quote_accepted'], to: 'in_progress', actor: 'worker', stamp: 'startedAt' },
  complete: { from: ['in_progress'], to: 'awaiting_confirmation', actor: 'worker', stamp: 'workerCompletedAt' },
  confirm: { from: ['awaiting_confirmation'], to: 'completed', actor: 'client', stamp: 'completedAt' },
  dispute: { from: ['in_progress', 'awaiting_confirmation'], to: 'disputed', actor: 'either', stamp: 'disputedAt' }
};

const actorFilter = (actor, userId) => {
  if (actor === 'worker') return { worker: userId };
  if (actor === 'client') return { client: userId };
  return { $or: [{ client: userId }, { worker: userId }] };
};

/**
 * Applies a lifecycle action as one conditional update, so a double tap or
 * two racing requests can't move a job twice. On failure, works out whether
 * the job is missing, not the caller's, or in the wrong state.
 */
export async function transition(jobId, action, user) {
  const rule = TRANSITIONS[action];
  if (!rule) throw new HttpError(400, `Unknown action: ${action}`);
  if (!mongoose.isValidObjectId(jobId)) throw new HttpError(404, 'Job not found');

  const update = { status: rule.to, [rule.stamp]: new Date() };
  if (action === 'dispute') update.disputedBy = user._id;

  const job = await Job.findOneAndUpdate(
    { _id: jobId, status: { $in: rule.from }, ...actorFilter(rule.actor, user._id) },
    update,
    { new: true }
  );
  if (job) return job;

  const existing = await Job.findById(jobId).lean();
  if (!existing) throw new HttpError(404, 'Job not found');
  const isClient = String(existing.client) === String(user._id);
  const isWorker = String(existing.worker) === String(user._id);
  const allowed = rule.actor === 'client' ? isClient : rule.actor === 'worker' ? isWorker : isClient || isWorker;
  if (!allowed) throw new HttpError(403, 'This is not your job');
  throw new HttpError(409, `Can't ${action} a job that is ${existing.status.replace('_', ' ')}`);
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
  if (!Number.isInteger(deposit) || deposit < 0 || deposit > price) {
    throw new HttpError(400, 'Deposit must be a whole number between 0 and your price');
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
