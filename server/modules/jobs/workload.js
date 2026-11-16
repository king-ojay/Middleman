// The cap on how many jobs a worker holds at once (config/workload.js). The
// jobs that count are the active ones (ACTIVE_STATUSES in job.model.js, the
// one list, also used by the call button); disputed jobs count. At the limit
// a worker can still browse open jobs, but can't send an offer and can't be
// chosen.
import Job, { ACTIVE_STATUSES } from './job.model.js';
import User from '../users/user.model.js';
import { HttpError } from '../httpError.js';
import { MAX_ACTIVE_JOBS } from '../../config/workload.js';

export const AT_LIMIT_MESSAGE = `You have ${MAX_ACTIVE_JOBS} jobs in progress. Finish one before taking another.`;
export const WORKER_BUSY_MESSAGE = `This worker is busy right now with ${MAX_ACTIVE_JOBS} jobs in progress. Choose someone else, or try again later.`;

/** Active jobs per worker id (string), for the given workers. */
export async function activeJobCounts(workerIds) {
  const counts = await Job.aggregate([
    { $match: { worker: { $in: workerIds }, status: { $in: ACTIVE_STATUSES } } },
    { $group: { _id: '$worker', n: { $sum: 1 } } }
  ]);
  return new Map(counts.map(c => [String(c._id), c.n]));
}

/** { active, limit, atLimit, message } for one worker; message is null below the limit. */
export async function workload(workerId, session = null) {
  const active = await Job.countDocuments({ worker: workerId, status: { $in: ACTIVE_STATUSES } }).session(session);
  const atLimit = active >= MAX_ACTIVE_JOBS;
  return { active, limit: MAX_ACTIVE_JOBS, atLimit, message: atLimit ? AT_LIMIT_MESSAGE : null };
}

/** Throws 409 with `message` when the worker is at the limit. */
export async function assertBelowLimit(workerId, message, session = null) {
  if ((await workload(workerId, session)).atLimit) throw new HttpError(409, message);
}

/**
 * The check-and-set for giving `workerId` a job, inside `session`'s
 * transaction: first a write to the worker's own record, then the count.
 * Two transactions doing this for the same worker write the same document,
 * so MongoDB lets only one commit; the other is retried
 * (connection.transaction), counts again with the first job included, and is
 * refused at the limit. The count always comes from the jobs themselves, so
 * nothing needs adjusting when a job is confirmed, refunded, reopened or
 * deleted.
 */
export async function claimSlot(workerId, session, message) {
  await User.updateOne({ _id: workerId }, { $inc: { workloadLock: 1 } }, { session, timestamps: false });
  await assertBelowLimit(workerId, message, session);
}
