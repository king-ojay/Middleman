import { useState } from 'react';
import { api } from '../api.js';
import { Button } from './ui/index.js';

// The next step(s) available to this person for this job (Fig. 5). Phase 3
// replaces "Start job" with escrow funding.
const ACTIONS = {
  worker: {
    quote_accepted: [{ action: 'start', label: 'Start job', primary: true }],
    in_progress: [{ action: 'complete', label: 'Mark as complete', primary: true }, { action: 'dispute', label: 'Report a problem' }]
  },
  client: {
    in_progress: [{ action: 'dispute', label: 'Report a problem' }],
    // Confirming needs a rating (FR-12), so it opens the Confirm & rate screen.
    awaiting_confirmation: [{ to: 'rate', label: 'Confirm & rate', primary: true }, { action: 'dispute', label: 'Report a problem' }]
  }
};

export default function JobActions({ job, role, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const actions = ACTIONS[role]?.[job.status] || [];
  if (actions.length === 0) return null;

  const run = async action => {
    if (action === 'dispute' && !window.confirm('Report a problem with this job? It will be held for review.')) return;
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
    <div className="mt-4 space-y-3">
      {actions.map(({ action, to, label, primary }) =>
        to ? (
          <Button key={to} to={`/my-jobs/${job._id}`}>{label}</Button>
        ) : (
          <Button key={action} variant={primary ? 'primary' : 'plain'} disabled={busy} onClick={() => run(action)}>
            {label}
          </Button>
        )
      )}
      {error && <p className="text-small text-danger" role="alert">{error}</p>}
    </div>
  );
}
