import { useEffect, useState } from 'react';
import WorkerCard from '../components/WorkerCard.jsx';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { CATEGORIES, AREAS } from '../options.js';

export default function Discover() {
  const { user } = useAuth();
  const [category, setCategory] = useState('electrician');
  const [area, setArea] = useState('');
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams({ clientId: user._id, category, ...(area && { area }) });
    setLoading(true);
    setError('');
    api(`/api/discover?${params}`)
      .then(setWorkers)
      .catch(err => { setWorkers([]); setError(err.message); })
      .finally(() => setLoading(false));
  }, [user, category, area]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <h1 className="font-display text-3xl text-ink mb-2">Find a worker</h1>
      <p className="text-ink/60 mb-8">Ranked by trust in your network first — not by star average.</p>

      {error && (
        <p className="text-xs text-brick bg-brick/10 border border-brick/20 rounded-sm px-3 py-2 mb-6 inline-block">
          Couldn't load workers: {error}
        </p>
      )}

      <div className="flex gap-4 mb-8">
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="border border-ink/20 rounded px-3 py-2 text-sm bg-white/60"
        >
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select
          value={area}
          onChange={e => setArea(e.target.value)}
          className="border border-ink/20 rounded px-3 py-2 text-sm bg-white/60"
        >
          <option value="">Any area</option>
          {AREAS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
      </div>

      <div className="space-y-3">
        {loading && <p className="text-sm text-ink/50">Loading…</p>}
        {!loading && !error && workers.length === 0 && (
          <p className="text-sm text-ink/60">No workers match this search yet.</p>
        )}
        {!loading && workers.map(w => <WorkerCard key={w._id} worker={w} />)}
      </div>
    </div>
  );
}
