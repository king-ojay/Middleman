// One SMS to the client RELEASE_REMINDER_BEFORE_MS (24h) before a job's
// automatic release (FR-13), so a problem can still be reported in time:
//   "Middleman: payment for <job> will be released to <worker> on <date>.
//    If there is a problem, open the app and report it before then."
// Sent from the same sweep as the release (autoRelease.js releaseDueJobs).
// Each job is claimed with one conditional update (releaseReminderAt still
// unset, the job still waiting for confirmation with the money held), as the
// release is, so two sweeps at once send it once, and a job already
// released, confirmed or disputed gets none. A failed send is logged and not
// retried: the job page shows the same date. The SMS stays in English; logs
// carry the job id only.
import Job from '../jobs/job.model.js';
import User from '../users/user.model.js';
import { now } from '../clock.js';
import { AUTO_RELEASE_AFTER_MS, RELEASE_REMINDER_BEFORE_MS } from '../../config/autoRelease.js';
import { getOtpProvider } from '../auth/otp/providers.js';
import { toE164 } from '../auth/otp/otp.js';

/** Jobs released automatically within the next 24 hours that have had no reminder. */
export const reminderDueFilter = (at = now()) => ({
  status: 'awaiting_confirmation',
  'escrow.status': 'held',
  releaseReminderAt: null,
  workerCompletedAt: {
    $lte: new Date(at.getTime() - (AUTO_RELEASE_AFTER_MS - RELEASE_REMINDER_BEFORE_MS)),
    $gt: new Date(at.getTime() - AUTO_RELEASE_AFTER_MS)
  }
});

// "20 Nov 2026, 14:05" in Kigali time, as the app writes it.
const kigaliDate = at => new Date(at).toLocaleString('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kigali'
});
// A long description is cut so the message stays about one SMS.
const short = text => (text.length > 40 ? `${text.slice(0, 39).trimEnd()}…` : text);

export const reminderText = ({ description, worker, releaseAt }) =>
  `Middleman: payment for "${short(description)}" will be released to ${worker} on ${kigaliDate(releaseAt)}. If there is a problem, open the app and report it before then.`;

/** Sends every due reminder once. Returns { due, sent, failed }. */
export async function sendDueReminders() {
  const due = await Job.find(reminderDueFilter(), '_id').lean();
  let sent = 0;
  let failed = 0;
  for (const { _id } of due) {
    const job = await Job.findOneAndUpdate({ _id, ...reminderDueFilter() }, { releaseReminderAt: now() }, { new: true }).lean();
    if (!job) continue; // claimed by another sweep, or no longer waiting
    const [client, worker] = await Promise.all([
      User.findById(job.client, 'phone').lean(),
      User.findById(job.worker, 'name').lean()
    ]);
    if (!client || !worker) continue; // a deleted account: nobody to tell, or nobody to name
    const releaseAt = new Date(new Date(job.workerCompletedAt).getTime() + AUTO_RELEASE_AFTER_MS);
    try {
      await getOtpProvider().sendSms(toE164(client.phone), reminderText({ description: job.description, worker: worker.name, releaseAt }));
      sent += 1;
    } catch (err) {
      failed += 1;
      console.error(`[auto-release] reminder for job ${_id} not sent (${err.name})`);
    }
  }
  return { due: due.length, sent, failed };
}
