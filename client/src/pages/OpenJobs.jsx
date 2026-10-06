import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { formatRwf } from '../format.js';
import { categoryLabel, areaLabel } from '../options.js';
import TrustBadge from '../components/TrustBadge.jsx';

// Worker home: open jobs in the worker's area that match one of their skills.
// Each job shows how trusted its client is from this worker's point of view,
// and takes one response: accept the client's price, or offer another (FR-05).
export default function OpenJobs() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadFeed = () =>
    api('/api/jobs/feed')
      .then(setJobs)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));

  useEffect(() => { loadFeed(); }, [user]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <h1 className="font-display text-3xl text-ink mb-2">Open jobs near you</h1>
      <p className="text-ink/60 mb-8">
        {(user.skills || []).map(categoryLabel).join(', ')} jobs in {areaLabel(user.area)}
      </p>

      {loading && <p className="text-sm text-ink/50">Loading…</p>}
      {error && <p className="text-sm text-brick">Couldn't load jobs: {error}</p>}
      {!loading && !error && jobs.length === 0 && (
        <p className="text-sm text-ink/60">No open jobs match your skills in your area right now.</p>
      )}

      <div className="space-y-3">
        {jobs.map(job => (
          <div key={job._id} className="bg-white/50 border border-ink/10 rounded-sm px-5 py-4">
            <div className="flex items-start justify-between gap-6">
              <div>
                <h3 className="font-medium text-ink">{job.description}</h3>
                <p className="text-sm text-ink/60 mt-1">
                  {categoryLabel(job.category)} · {areaLabel(job.area)} · posted by {job.client?.name} on {new Date(job.createdAt).toLocaleDateString()}
                </p>
                <div className="mt-2"><TrustBadge trustSource={job.clientTrust} /></div>
              </div>
              <p className="font-medium text-ink shrink-0">{formatRwf(job.proposedPrice)}</p>
            </div>
            <ResponseControls job={job} onSent={loadFeed} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ResponseControls({ job, onSent }) {
  const [offering, setOffering] = useState(false);
  const [price, setPrice] = useState(String(job.proposedPrice));
  const [deposit, setDeposit] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  if (job.myResponse) {
    const r = job.myResponse;
    return (
      <p className="text-sm text-ink/70 mt-3">
        {r.isCounter ? `You offered ${formatRwf(r.amount)}` : `You accepted ${formatRwf(r.amount)}`}
        {r.depositAmount > 0 && ` with a ${formatRwf(r.depositAmount)} materials deposit`}. Waiting for the client to choose.
      </p>
    );
  }

  const send = async body => {
    setError('');
    setSending(true);
    try {
      await api(`/api/jobs/${job._id}/responses`, { method: 'POST', body: JSON.stringify(body) });
      onSent();
    } catch (err) {
      setError(err.message);
      setSending(false);
    }
  };

  const sendOffer = e => {
    e.preventDefault();
    send({ amount: Number(price), depositAmount: Number(deposit) || 0 });
  };

  return (
    <div className="mt-4">
      {!offering && (
        <div className="flex flex-wrap gap-3">
          <button disabled={sending} onClick={() => send({})} className="px-4 py-2 text-sm font-medium bg-steel text-paper rounded hover:bg-steel-dark transition-colors disabled:opacity-60">
            Accept {formatRwf(job.proposedPrice)}
          </button>
          <button onClick={() => setOffering(true)} className="px-4 py-2 text-sm font-medium border border-ink/20 rounded hover:border-ink/40 transition-colors">
            Make an offer
          </button>
        </div>
      )}

      {offering && (
        <form onSubmit={sendOffer} className="space-y-3 max-w-sm">
          <div>
            <label htmlFor={`price-${job._id}`} className="block text-sm font-medium text-ink mb-1">Your price (RWF)</label>
            <input id={`price-${job._id}`} type="number" min="1" step="1" required value={price} onChange={e => setPrice(e.target.value)} className="w-full border border-ink/20 rounded px-3 py-2 bg-white/60" />
          </div>
          <div>
            <label htmlFor={`deposit-${job._id}`} className="block text-sm font-medium text-ink mb-1">Materials deposit (RWF, optional)</label>
            <input id={`deposit-${job._id}`} type="number" min="0" step="1" max={price || undefined} value={deposit} onChange={e => setDeposit(e.target.value)} className="w-full border border-ink/20 rounded px-3 py-2 bg-white/60" placeholder="Leave empty if you don't need one" />
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={sending} className="px-4 py-2 text-sm font-medium bg-steel text-paper rounded hover:bg-steel-dark transition-colors disabled:opacity-60">
              {sending ? 'Sending…' : 'Send offer'}
            </button>
            <button type="button" onClick={() => setOffering(false)} className="px-4 py-2 text-sm font-medium text-ink/60 hover:text-ink">
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-brick mt-2">Couldn't send: {error}</p>}
    </div>
  );
}
