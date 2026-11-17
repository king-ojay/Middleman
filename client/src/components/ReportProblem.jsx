import { useId, useState } from 'react';
import { api } from '../api.js';
import { DISPUTE_DETAILS_MAX, DISPUTE_DETAILS_MIN, cleanDisputeDetails } from '../disputeReasons.shared.js';
import { reasonsFor } from '../disputeReasons.js';
import { t } from '../i18n/index.js';
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
  const reasonError = tried && !reason ? t('report.err.reason') : '';
  const detailsError = tried && length < DISPUTE_DETAILS_MIN ? t('report.err.details', { min: DISPUTE_DETAILS_MIN }) : '';

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
    <Sheet open={open} title={t('report.title')} onClose={() => !sending && onClose()}>
      <div className="space-y-5">
        <p className="text-body text-on-warn bg-warn rounded-field px-4 py-3">
          {t('report.locked')}
        </p>

        <div>
          <p id={reasonsId} className="text-label text-ink mb-2">{t('report.what')}</p>
          <div role="radiogroup" aria-labelledby={reasonsId} aria-required="true" aria-invalid={reasonError ? true : undefined} className="grid gap-2">
            {reasonsFor(role).map(r => {
              const selected = reason === r.value;
              return (
                <button
                  key={r.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setReason(r.value)}
                  className={`min-h-[52px] px-4 py-3 rounded-field border text-left text-body font-medium transition-colors ${
                    selected ? 'bg-surface border-primary ring-1 ring-inset ring-primary text-ink' : 'bg-surface border-line text-ink hover:border-primary'
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
          label={t('report.wrong')}
          helper={t('report.helper', { length, max: DISPUTE_DETAILS_MAX, min: DISPUTE_DETAILS_MIN })}
          error={detailsError}
        >
          {field => (
            <TextArea
              {...field}
              className="h-32"
              value={details}
              maxLength={DISPUTE_DETAILS_MAX}
              onChange={e => setDetails(e.target.value)}
              placeholder={t(`report.placeholder.${role}`)}
            />
          )}
        </FormField>

        {error && <p className="text-small text-danger" role="alert">{error}</p>}
        <div className="space-y-2">
          <Button onClick={send} disabled={sending}>{sending ? t('common.sending') : t('report.submit')}</Button>
          <Button variant="outline" onClick={onClose} disabled={sending}>{t('common.cancel')}</Button>
        </div>
      </div>
    </Sheet>
  );
}
