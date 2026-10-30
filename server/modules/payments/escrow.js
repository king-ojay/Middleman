// Sandbox escrow (FR-09, FR-13, FR-14). The app never holds money: the
// payment provider does, and this module keeps the job and the ledger in step
// with it.
//
//   quote_accepted --fund--> escrow_held -> in_progress -> awaiting_confirmation
//     --client confirms (release)--> completed
//   escrow_held | in_progress | awaiting_confirmation --dispute--> disputed
//     --admin release--> resolved (released)   --admin refund--> resolved (refunded)
//
// Every money movement runs in three steps:
//   1. start: one conditional update claims the job (escrow.status must be
//      what the move expects, so a double tap or a second request gets 409)
//      and records the movement's idempotency key; the ledger gets
//      `<kind>_requested`, in the same transaction.
//   2. call the provider with that key as X-Reference-Id.
//   3. settle: when the provider says SUCCESSFUL or FAILED (straight away,
//      by callback, or by polling), move the job on or back; the ledger gets
//      `<kind>_succeeded` or `<kind>_failed`. Settling a movement twice does
//      nothing the second time.
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import Job from '../jobs/job.model.js';
import Transaction from './transaction.model.js';
import { getPaymentProvider } from './providers/index.js';
import { HttpError } from '../httpError.js';

const MOVES = {
  fund: { api: 'collection', from: 'none', pending: 'funding', done: 'held', back: 'none', stamp: 'heldAt', fundsTo: 'escrow' },
  release: { api: 'disbursement', from: 'held', pending: 'releasing', done: 'released', back: 'held', stamp: 'releasedAt', fundsTo: 'worker' },
  refund: { api: 'disbursement', from: 'held', pending: 'refunding', done: 'refunded', back: 'held', stamp: 'refundedAt', fundsTo: 'client' }
};

// Jobs from before escrow existed have no escrow field at all.
const escrowStatusIs = status => (status === 'none' ? { $in: ['none', null] } : status);

const record = (job, entry, session) => Transaction.create([{
  job: job._id,
  jobStatus: job.status,
  amount: job.escrow?.amount ?? null,
  currency: job.escrow?.currency ?? null,
  provider: job.escrow?.provider ?? null,
  ...entry
}], { session });

/**
 * Starts a movement on the job matching `filter` (see the steps above) and
 * calls the provider. Returns the job after a first status check, or null
 * when no job matched (the caller explains why).
 */
async function move(kind, { filter, jobStatus, doneStatus, backStatus, extra = {}, actor, actorRole }) {
  const m = MOVES[kind];
  const provider = getPaymentProvider();
  const ref = randomUUID();

  const job = await mongoose.connection.transaction(async session => {
    const current = await Job.findOne({ ...filter, 'escrow.status': escrowStatusIs(m.from) }).session(session).lean();
    if (!current) return null;
    const amount = kind === 'fund' ? current.agreedPrice : current.escrow.amount;
    const claimed = await Job.findOneAndUpdate(
      { ...filter, _id: current._id, 'escrow.status': escrowStatusIs(m.from) },
      {
        ...(jobStatus ? { status: jobStatus } : {}),
        ...extra,
        'escrow.status': m.pending,
        'escrow.pending': { kind, ref, accepted: false, doneStatus, backStatus },
        [`escrow.${kind}Ref`]: ref,
        ...(kind === 'fund' ? { 'escrow.amount': amount, 'escrow.currency': provider.currency, 'escrow.provider': provider.name } : {})
      },
      { new: true, session }
    ).lean();
    if (!claimed) return null;
    await record(claimed, { event: `${kind}_requested`, escrowFrom: m.from, escrowTo: m.pending, providerRef: ref, actor, actorRole }, session);
    return claimed;
  });
  if (!job) return null;

  const party = m.fundsTo === 'worker' ? { role: 'worker', userId: String(job.worker) } : { role: 'client', userId: String(job.client) };
  try {
    await provider[kind === 'fund' ? 'requestToPay' : 'transfer']({
      referenceId: ref,
      amount: job.escrow.amount,
      currency: job.escrow.currency,
      externalId: String(job._id),
      party,
      note: `Middleman job ${job._id} (${kind}, sandbox)`
    });
  } catch (err) {
    if (err.definite) {
      // Refused: nothing moved, so put the job back; the person can try again.
      await settle(job._id, ref, { status: 'FAILED', reason: err.message });
      throw new HttpError(502, kind === 'fund'
        ? "The payment service didn't accept the payment. Nothing was charged. Please try again."
        : "The payment service didn't accept the payout. The money is still held. Please try again.");
    }
    // It may have arrived: leave it pending; a callback or poll settles it.
    return Job.findById(job._id).lean();
  }
  await Job.updateOne({ _id: job._id, 'escrow.pending.ref': ref }, { 'escrow.pending.accepted': true });
  return sync(job._id);
}

/**
 * Moves the job on (SUCCESSFUL) or back (FAILED) for the movement `ref`, and
 * writes the ledger record, in one transaction. Does nothing when `ref` is
 * no longer pending, so repeated callbacks and racing polls are harmless.
 */
export async function settle(jobId, ref, { status, reason = '' }) {
  const ok = status === 'SUCCESSFUL';
  return mongoose.connection.transaction(async session => {
    const job = await Job.findOne({ _id: jobId, 'escrow.pending.ref': ref }).session(session).lean();
    if (!job) return Job.findById(jobId).session(session).lean();
    const p = job.escrow.pending;
    const m = MOVES[p.kind];
    const now = new Date();
    const update = ok
      ? {
          status: p.doneStatus,
          'escrow.status': m.done,
          [`escrow.${m.stamp}`]: now,
          'escrow.pending': null,
          ...(p.doneStatus === 'resolved' ? { resolvedAt: now } : {})
        }
      : {
          status: p.backStatus,
          'escrow.status': m.back,
          'escrow.pending': null,
          // a failed release after confirming: the job is not confirmed after all
          ...(p.backStatus === 'awaiting_confirmation' ? { completedAt: null } : {})
        };
    const updated = await Job.findOneAndUpdate({ _id: jobId, 'escrow.pending.ref': ref }, update, { new: true, session }).lean();
    if (!updated) return Job.findById(jobId).session(session).lean();
    await record(updated, {
      event: `${p.kind}_${ok ? 'succeeded' : 'failed'}`,
      escrowFrom: m.pending,
      escrowTo: ok ? m.done : m.back,
      providerRef: ref,
      actorRole: 'system',
      reason: String(reason || '').slice(0, 300)
    }, session);
    return updated;
  });
}

/**
 * Status polling (the fallback when no callback comes): asks the provider
 * about the job's movement in flight and settles it if it has finished.
 * Returns the job; unchanged when nothing is pending or the provider can't
 * be reached.
 */
export async function sync(jobId) {
  const job = await Job.findById(jobId).lean();
  const p = job?.escrow?.pending;
  if (!p) return job;
  let result;
  try {
    result = await getPaymentProvider().getStatus(MOVES[p.kind].api, p.ref);
  } catch {
    return job;
  }
  if (result.status === 'SUCCESSFUL' || result.status === 'FAILED') return settle(job._id, p.ref, result);
  // Never received (the call failed before arriving): nothing moved.
  if (result.status === 'NOT_FOUND' && !p.accepted) return settle(job._id, p.ref, { status: 'FAILED', reason: 'not received by the provider' });
  return job;
}

// Settles whichever job has `ref` in flight (provider callbacks). The
// callback's own body is never trusted: the status is fetched from the provider.
export async function syncByRef(ref) {
  const job = await Job.findOne({ 'escrow.pending.ref': String(ref) }, '_id').lean();
  return job ? sync(job._id) : null;
}

const ownJob = async (jobId, user, role) => {
  if (!mongoose.isValidObjectId(jobId)) throw new HttpError(404, 'Job not found');
  const job = await Job.findById(jobId).lean();
  if (!job) throw new HttpError(404, 'Job not found');
  if (role && String(job[role]) !== String(user._id)) throw new HttpError(403, 'This is not your job');
  return job;
};

const escrowConflict = (job, action) => {
  const s = job.escrow?.status || 'none';
  if (s === 'funding') return new HttpError(409, 'A payment for this job is already waiting for approval');
  if (s === 'releasing' || s === 'refunding') return new HttpError(409, 'A payout for this job is already on its way');
  if (s === 'held' && action === 'fund') return new HttpError(409, 'This job is already paid into escrow');
  if (s === 'released') return new HttpError(409, 'The money for this job has already been released');
  if (s === 'refunded') return new HttpError(409, 'The money for this job has already been refunded');
  return new HttpError(409, `Can't ${action} a job that is ${job.status.replaceAll('_', ' ')}`);
};

/** The client pays the agreed price into escrow (quote_accepted -> escrow_held). */
export async function fund(jobId, client) {
  await ownJob(jobId, client, 'client');
  const job = await move('fund', {
    filter: { _id: jobId, client: client._id, status: 'quote_accepted' },
    doneStatus: 'escrow_held',
    backStatus: 'quote_accepted',
    actor: client._id,
    actorRole: 'client'
  });
  if (job) return job;
  throw escrowConflict(await ownJob(jobId, client, 'client'), 'fund');
}

/**
 * The client confirms the work is done, which releases escrow to the worker
 * (awaiting_confirmation -> completed). A failed payout puts the job back to
 * awaiting confirmation.
 */
export async function release(jobId, client) {
  await ownJob(jobId, client, 'client');
  const job = await move('release', {
    filter: { _id: jobId, client: client._id, status: 'awaiting_confirmation' },
    jobStatus: 'completed',
    extra: { completedAt: new Date() },
    doneStatus: 'completed',
    backStatus: 'awaiting_confirmation',
    actor: client._id,
    actorRole: 'client'
  });
  if (job) return job;
  throw escrowConflict(await ownJob(jobId, client, 'client'), 'confirm');
}

/** An admin settles a dispute: `release` pays the worker, `refund` repays the client. */
export async function resolveDispute(jobId, outcome) {
  if (!['release', 'refund'].includes(outcome)) throw new HttpError(400, 'Outcome must be release or refund');
  await ownJob(jobId);
  const job = await move(outcome, {
    filter: { _id: jobId, status: 'disputed' },
    doneStatus: 'resolved',
    backStatus: 'disputed',
    actorRole: 'admin'
  });
  if (job) return job;
  throw escrowConflict(await ownJob(jobId), outcome);
}

/** Ledger record for a dispute (funds stay locked); joins the dispute's transaction. */
export function recordDispute(job, user, session) {
  const s = job.escrow?.status || 'none';
  return record(job, { event: 'dispute_opened', escrowFrom: s, escrowTo: s, actor: user._id, actorRole: user.role }, session);
}
