import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { formatBudget } from '../format.js';
import { CATEGORIES, AREAS, categoryLabel, areaLabel } from '../options.js';


export default function PostJob() {
  const { user } = useAuth();
  const [category, setCategory] = useState('electrician');
  const [description, setDescription] = useState('');
  const [area, setArea] = useState(user.area);
  const [budget, setBudget] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [posted, setPosted] = useState(null);
  const [myJobs, setMyJobs] = useState([]);

  const loadMyJobs = () =>
    api(`/api/jobs?client=${user._id}`).then(setMyJobs).catch(() => setMyJobs([]));

  useEffect(() => { loadMyJobs(); }, [user]);

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setPosted(null);
    setSubmitting(true);
    try {
      const job = await api('/api/jobs', {
        method: 'POST',
        body: JSON.stringify({ client: user._id, category, description, area, budget: budget ? Number(budget) : null })
      });
      setPosted(job);
      setDescription('');
      setBudget('');
      loadMyJobs();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <h1 className="font-display text-3xl text-ink mb-2">Post a job</h1>
      <p className="text-ink/60 mb-8">Describe what you need done. Workers in your area will send quotes.</p>

      {posted && (
        <div role="status" className="mb-8 border border-leaf/40 bg-leaf/10 rounded-sm px-4 py-3">
          <p className="font-medium text-ink">Job posted successfully.</p>
          <p className="text-sm text-ink/70 mt-1">
            “{posted.description}” · {categoryLabel(posted.category)} · {areaLabel(posted.area)} · {formatBudget(posted.budget)}
          </p>
          <p className="text-sm text-ink/70 mt-1">
            {posted.matchingWorkers.length > 0
              ? `Now visible to ${categoryLabel(posted.category).toLowerCase()} workers in ${areaLabel(posted.area)}: ${posted.matchingWorkers.map(w => w.name).join(', ')}.`
              : `No ${categoryLabel(posted.category).toLowerCase()} workers are registered in ${areaLabel(posted.area)} yet, so no workers can see it for now.`}
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="category" className="block text-sm font-medium text-ink mb-1">Category</label>
          <select id="category" value={category} onChange={e => setCategory(e.target.value)} className="w-full border border-ink/20 rounded px-3 py-2 bg-white/60">
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-ink mb-1">Description</label>
          <textarea id="description" rows={4} required value={description} onChange={e => setDescription(e.target.value)} className="w-full border border-ink/20 rounded px-3 py-2 bg-white/60" placeholder="e.g. Kitchen tap is leaking, needs replacing" />
        </div>
        <div>
          <label htmlFor="area" className="block text-sm font-medium text-ink mb-1">Area</label>
          <select id="area" value={area} onChange={e => setArea(e.target.value)} className="w-full border border-ink/20 rounded px-3 py-2 bg-white/60">
            {AREAS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="budget" className="block text-sm font-medium text-ink mb-1">Budget (RWF, optional)</label>
          <input id="budget" type="number" min="0" step="500" value={budget} onChange={e => setBudget(e.target.value)} className="w-full border border-ink/20 rounded px-3 py-2 bg-white/60" placeholder="e.g. 20000" />
        </div>
        {error && <p className="text-sm text-brick">Couldn't post job: {error}</p>}
        <button type="submit" disabled={submitting} className="px-5 py-3 bg-steel text-paper rounded font-medium hover:bg-steel-dark transition-colors disabled:opacity-60">
          {submitting ? 'Posting…' : 'Post job'}
        </button>
      </form>

      <h2 className="font-display text-2xl text-ink mt-12 mb-4">Your posted jobs</h2>
      {myJobs.length === 0 && <p className="text-sm text-ink/60">You haven't posted any jobs yet.</p>}
      <div className="space-y-3">
        {myJobs.map(job => (
          <div key={job._id} className="bg-white/50 border border-ink/10 rounded-sm px-5 py-4">
            <h3 className="font-medium text-ink">{job.description}</h3>
            <p className="text-sm text-ink/60 mt-1">
              {categoryLabel(job.category)} · {areaLabel(job.area)} · {job.agreedPrice ? `Agreed ${job.agreedPrice.toLocaleString('en-US')} RWF` : formatBudget(job.budget)} ·{' '}
              <span className="capitalize">{job.status.replace('_', ' ')}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
