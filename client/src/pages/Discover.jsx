import { useEffect, useState } from 'react';
import WorkerCard from '../components/WorkerCard.jsx';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

// Placeholder data shown until the API + seed data are wired up, so the
// screen is reviewable today. Shape matches exactly what GET /api/discover
// returns — see server/routes/discover.js.
const PLACEHOLDER_WORKERS = [
  { _id: '1', name: 'Eric Habimana', skills: ['electrician'], area: 'kimironko', trustSource: 'network' },
  { _id: '2', name: 'Claudine Uwase', skills: ['electrician'], area: 'kimironko', trustSource: 'area' },
  { _id: '3', name: 'Jean Bosco', skills: ['electrician'], area: 'kwa_nayinzira', trustSource: 'fallback', verifiedStatus: 'verified' }
];

export default function Discover() {
  const { user } = useAuth();
  const [category, setCategory] = useState('electrician');
  const [area, setArea] = useState('');
  const [workers, setWorkers] = useState(PLACEHOLDER_WORKERS);
  const [loading, setLoading] = useState(false);
  const [usingLiveData, setUsingLiveData] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams({ clientId: user._id, category, ...(area && { area }) });
    setLoading(true);
    api(`/api/discover?${params}`)
      .then(data => { setWorkers(data); setUsingLiveData(true); })
      .catch(() => { setWorkers(PLACEHOLDER_WORKERS); setUsingLiveData(false); })
      .finally(() => setLoading(false));
  }, [user, category, area]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <h1 className="font-display text-3xl text-ink mb-2">Find a worker</h1>
      <p className="text-ink/60 mb-8">Ranked by trust in your network first — not by star average.</p>

      {!usingLiveData && (
        <p className="text-xs text-brick bg-brick/10 border border-brick/20 rounded-sm px-3 py-2 mb-6 inline-block">
          Showing placeholder data — backend not connected yet.
        </p>
      )}

      <div className="flex gap-4 mb-8">
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="border border-ink/20 rounded px-3 py-2 text-sm bg-white/60"
        >
          <option value="electrician">Electrician</option>
          <option value="mason">Mason</option>
          <option value="plumber">Plumber</option>
          <option value="cleaner">Cleaner</option>
          <option value="mechanic">Mechanic</option>
        </select>
        <select
          value={area}
          onChange={e => setArea(e.target.value)}
          className="border border-ink/20 rounded px-3 py-2 text-sm bg-white/60"
        >
          <option value="">Any area</option>
          <option value="kimironko">Kimironko</option>
          <option value="kwa_nayinzira">Kwa Nayinzira</option>
          <option value="remera">Remera</option>
          <option value="gikondo">Gikondo</option>
        </select>
      </div>

      <div className="space-y-3">
        {loading && <p className="text-sm text-ink/50">Loading…</p>}
        {!loading && workers.map(w => <WorkerCard key={w._id} worker={w} />)}
      </div>
    </div>
  );
}
