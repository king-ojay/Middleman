// FR-13, automatic release: a job that has awaited the client's confirmation
// for AUTO_RELEASE_AFTER_MS (config/autoRelease.js) with no dispute is
// released to the worker (escrow.js autoRelease). The free host sleeps, so
// this runs from three places: when the server starts, every
// AUTO_RELEASE_CHECK_EVERY_MS while it runs (startAutoRelease, server.js), and
// when either party opens a due job's page (releaseIfDue, jobs.routes.js).
// They can run at the same moment: escrow.js claims the job in one
// conditional update, so only one of them pays. Logs carry job ids and
// counts only.
import Job from '../jobs/job.model.js';
import { autoRelease, sync } from './escrow.js';
import { sendDueReminders } from './releaseReminder.js';
import { now } from '../clock.js';
import { AUTO_RELEASE_AFTER_MS, AUTO_RELEASE_CHECK_EVERY_MS } from '../../config/autoRelease.js';

/** Jobs whose confirmation window has passed, with the money still held and nothing in flight. */
export const dueFilter = (at = now()) => ({
  status: 'awaiting_confirmation',
  'escrow.status': 'held',
  workerCompletedAt: { $lte: new Date(at.getTime() - AUTO_RELEASE_AFTER_MS) }
});

/** When the job will be released automatically, or null when it isn't waiting for that. */
export function autoReleaseAt(job) {
  if (job.status !== 'awaiting_confirmation' || job.escrow?.status !== 'held' || !job.workerCompletedAt) return null;
  return new Date(new Date(job.workerCompletedAt).getTime() + AUTO_RELEASE_AFTER_MS);
}

const logFailure = (jobId, err) => console.error(`[auto-release] job ${jobId}: payout not completed (${err.status || 'error'}); will retry at the next check`);

/**
 * Releases the job if it is due and `userId` is its client or worker (a job
 * page being opened). Never throws: the page still loads, showing the job as
 * it is.
 */
export async function releaseIfDue(jobId, userId) {
  const due = await Job.exists({ _id: jobId, $or: [{ client: userId }, { worker: userId }], ...dueFilter() });
  if (!due) return;
  await autoRelease(jobId).catch(err => logFailure(jobId, err));
}

/**
 * One sweep: checks automatic payouts still in flight with the provider,
 * releases every due job, then sends the 24-hour reminders
 * (releaseReminder.js). Returns { inFlight, due, released, failed, reminded }.
 */
export async function releaseDueJobs() {
  const inFlight = await Job.find({ autoReleased: true, 'escrow.status': 'releasing' }, '_id').lean();
  for (const { _id } of inFlight) await sync(_id).catch(err => logFailure(_id, err));

  const due = await Job.find(dueFilter(), '_id').lean();
  let released = 0;
  let failed = 0;
  for (const { _id } of due) {
    try {
      if (await autoRelease(_id)) released += 1;
    } catch (err) {
      failed += 1;
      logFailure(_id, err);
    }
  }
  const reminders = await sendDueReminders().catch(err => {
    console.error(`[auto-release] reminders failed: ${err.name}`);
    return { sent: 0 };
  });
  return { inFlight: inFlight.length, due: due.length, released, failed, reminded: reminders.sent };
}

/** Runs a sweep now and then every AUTO_RELEASE_CHECK_EVERY_MS. Returns the timer. */
export function startAutoRelease() {
  const run = () => releaseDueJobs()
    .then(r => { if (r.due || r.inFlight || r.reminded) console.log(`[auto-release] due ${r.due}, released ${r.released}, failed ${r.failed}, in flight ${r.inFlight}, reminded ${r.reminded}`); })
    .catch(err => console.error(`[auto-release] check failed: ${err.name}`));
  run();
  const timer = setInterval(run, AUTO_RELEASE_CHECK_EVERY_MS);
  timer.unref();
  return timer;
}
