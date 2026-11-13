import { useId, useState } from 'react';
import { api } from '../api.js';
import { DISPUTE_DETAILS_MAX, DISPUTE_DETAILS_MIN, DISPUTE_REASONS, cleanDisputeDetails } from '../disputeReasons.shared.js';
import { Button, FormField, Sheet, TextArea } from './ui/index.js';

// "Report a problem" (FR-14): the reporter picks a reason from their role's
// list and says what is wrong in 20-500 characters; the server checks both
// again (jobs/lifecycle.js validateDispute). The draft stays while the sheet
// is closed and opened again.
export default function ReportProblem({ job, role, open, onClose, onReported }) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const reasonsId = useId();

  const length = cleanDisputeDetails(details).length;
  const reasonError = tried && !reason ? 'Choose what the problem is.' : '';
  const detailsError = tried && length < DISPUTE_DETAILS_MIN ? `Describe what is wrong in at least ${DISPUTE_DETAILS_MIN} characters.` : '';

  const send = async () => {
    setTried(true);
    setError('');
    if (!reason || length < DISPUTE_DETAILS_MIN) return;
    setSending(true);
    try {
      await api(`/api/jobs/${job._id}/dispute`, { method: 'POST', body: JSON.stringify({ reason, details }) });
      onReported();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open} title="Report a problem" onClose={() => !sending && onClose()}>
      <div className="space-y-5">
        <p className="text-body text-heading bg-accent-soft rounded-field px-4 py-3">
          The money stays locked in escrow until an admin reviews this and decides to pay the worker or refund the client.
        </p>

        <div>
          <p id={reasonsId} className="text-label text-ink mb-2">What is the problem?</p>
          <div role="radiogroup" aria-labelledby={reasonsId} aria-required="true" aria-invalid={reasonError ? true : undefined} className="grid gap-2">
            {DISPUTE_REASONS[role].map(r => {
              const selected = reason === r.value;
              return (
                <button
                  key={r.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setReason(r.value)}
                  className={`min-h-[52px] px-4 py-3 rounded-field border text-left text-body font-medium transition-colors ${
                    selected ? 'bg-accent-soft border-accent ring-1 ring-inset ring-accent text-heading' : 'bg-surface border-line text-ink hover:border-heading'
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
          {reasonError && <p className="text-small text-danger mt-2" role="alert">{reasonError}</p>}
        </div>

        <FormField
          label="What is wrong?"
          helper={`${length} of ${DISPUTE_DETAILS_MAX} characters, at least ${DISPUTE_DETAILS_MIN}. The other person and the admin will read this.`}
          error={detailsError}
        >
          {field => (
            <TextArea
              {...field}
              className="h-32"
              value={details}
              maxLength={DISPUTE_DETAILS_MAX}
              onChange={e => setDetails(e.target.value)}
              placeholder={role === 'client' ? 'For example: the tap still leaks and the worker has not come back.' : 'For example: the work was finished on Monday and the client has not replied since.'}
            />
          )}
        </FormField>

        {error && <p className="text-small text-danger" role="alert">{error}</p>}
        <div className="space-y-2">
          <Button onClick={send} disabled={sending}>{sending ? 'Sending…' : 'Report problem'}</Button>
          <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
        </div>
      </div>
    </Sheet>
  );
}
