import { reasonLabel } from '../disputeReasons.js';
import { t } from '../i18n/index.js';

// What was reported about a job: the reason and, under it, the description
// in the reporter's words (plain text, line breaks kept). Disputes from
// before a reason was asked for have neither.
export default function DisputeSummary({ job, reporterRole, className = '' }) {
  const reason = job.disputeReason ? reasonLabel(reporterRole, job.disputeReason) || job.disputeReason : null;
  return (
    <div className={className}>
      <p className="text-body font-semibold text-ink">{reason || t('report.noReason')}</p>
      {job.disputeDetails && <p className="text-body text-muted mt-1 whitespace-pre-line break-words">{job.disputeDetails}</p>}
    </div>
  );
}
