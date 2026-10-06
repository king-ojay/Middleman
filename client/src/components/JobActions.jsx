import { useState } from 'react';
import { api } from '../api.js';

// The next step(s) available to this person for this job (Fig. 5). Phase 3
// replaces "Start job" with escrow funding.
const ACTIONS = {
  worker: {
    quote_accepted: [{ action: 'start', label: 'Start job', primary: true }],
    in_progress: [{ action: 'complete', label: 'Mark as complete', primary: true }, { action: 'dispute', label: 'Report a problem' }]
  },
  client: {
    in_progress: [{ action: 'dispute', label: 'Report a problem' }],
    awaiting_confirmation: [{ action: 'confirm', label: 'Confirm job is done', primary: true }, { action: 'dispute', label: 'Report a problem' }]
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
    <div className="mt-3">
      <div className="flex flex-wrap gap-3">
        {actions.map(({ action, label, primary }) => (
          <button
            key={action}
            disabled={busy}
            onClick={() => run(action)}
            className={primary
              ? 'px-4 py-2 text-sm font-medium bg-steel text-paper rounded hover:bg-steel-dark transition-colors disabled:opacity-60'
              : 'px-4 py-2 text-sm font-medium border border-ink/20 rounded hover:border-ink/40 transition-colors disabled:opacity-60'}
          >
            {label}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-brick mt-2">{error}</p>}
    </div>
  );
}
