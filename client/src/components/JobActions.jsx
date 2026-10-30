import { useState } from 'react';
import { api } from '../api.js';
import { formatRwf } from '../format.js';
import { Button } from './ui/index.js';

const DISPUTE = { action: 'dispute', label: 'Report a problem' };

// The next step(s) available to this person for this job (Fig. 5). The
// worker starts only once the client has paid into escrow (FR-09).
const ACTIONS = {
  worker: {
    escrow_held: [{ action: 'start', label: 'Start job', primary: true }, DISPUTE],
    in_progress: [{ action: 'complete', label: 'Mark as complete', primary: true }, DISPUTE]
  },
  client: {
    quote_accepted: [{ action: 'fund', label: 'Pay into escrow', primary: true }],
    escrow_held: [DISPUTE],
    in_progress: [DISPUTE],
    // Confirming needs a rating (FR-12), so it opens the Confirm & rate screen.
    awaiting_confirmation: [{ to: 'rate', label: 'Confirm & rate', primary: true }, DISPUTE]
  }
};

// While a payment waits for approval there is nothing to do but check on it.
const CHECK_PAYMENT = [{ action: 'escrow/sync', label: 'Check payment' }];

// primaryOnly (job cards): just the one next step, no "Report a problem";
// that stays on the job's own page.
export default function JobActions({ job, role, onChange, primaryOnly = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const all = job.escrow?.pending ? CHECK_PAYMENT : ACTIONS[role]?.[job.status] || [];
  const actions = primaryOnly && all !== CHECK_PAYMENT ? all.filter(a => a.primary) : all;
  if (actions.length === 0) return null;

  const run = async action => {
    if (action === 'dispute' && !window.confirm('Report a problem with this job? The payment stays locked until it is reviewed.')) return;
    if (action === 'fund' && !window.confirm(`Pay ${formatRwf(job.agreedPrice)} into escrow? It is held until you confirm the work is done. (Sandbox: no real money.)`)) return;
    setError('');
    setBusy(true);
    try {
      await api(`/api/jobs/${job._id}/${action}`, { method: 'POST' });
      onChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={primaryOnly ? 'space-y-3' : 'mt-4 space-y-3'}>
      {actions.map(({ action, to, label, primary }) =>
        to ? (
          <Button key={to} to={`/my-jobs/${job._id}`}>{label}</Button>
        ) : (
          <Button key={action} variant={primary ? 'primary' : primaryOnly ? 'outline' : 'plain'} disabled={busy} onClick={() => run(action)}>
            {label}
          </Button>
        )
      )}
      {error && <p className="text-small text-danger" role="alert">{error}</p>}
    </div>
  );
}
