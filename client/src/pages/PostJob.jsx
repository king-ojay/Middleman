import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { formatRwf } from '../format.js';
import { CATEGORIES, AREAS, categoryLabel, areaLabel } from '../options.js';


export default function PostJob() {
  const { user } = useAuth();
  const [category, setCategory] = useState('electrician');
  const [description, setDescription] = useState('');
  const [area, setArea] = useState(user.area);
  const [proposedPrice, setProposedPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [posted, setPosted] = useState(null);

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setPosted(null);
    setSubmitting(true);
    try {
      const job = await api('/api/jobs', {
        method: 'POST',
        body: JSON.stringify({ category, description, area, proposedPrice: Number(proposedPrice) })
      });
      setPosted(job);
      setDescription('');
      setProposedPrice('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <h1 className="font-display text-3xl text-ink mb-2">Post a job</h1>
      <p className="text-ink/60 mb-8">Describe what you need done and name your price. Workers in your area can accept it or offer their own.</p>

      {posted && (
        <div role="status" className="mb-8 border border-leaf/40 bg-leaf/10 rounded-sm px-4 py-3">
          <p className="font-medium text-ink">Job posted successfully.</p>
          <p className="text-sm text-ink/70 mt-1">
            “{posted.description}” · {categoryLabel(posted.category)} · {areaLabel(posted.area)} · {formatRwf(posted.proposedPrice)}
          </p>
          <p className="text-sm text-ink/70 mt-1">
            {posted.matchingWorkers.length > 0
              ? `Now visible to ${categoryLabel(posted.category).toLowerCase()} workers in ${areaLabel(posted.area)}: ${posted.matchingWorkers.map(w => w.name).join(', ')}.`
              : `No ${categoryLabel(posted.category).toLowerCase()} workers are registered in ${areaLabel(posted.area)} yet, so no workers can see it for now.`}
          </p>
          <Link to={`/my-jobs/${posted._id}`} className="inline-block text-sm text-ink underline mt-2">See responses as they come in</Link>
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
          <label htmlFor="proposedPrice" className="block text-sm font-medium text-ink mb-1">Your price (RWF)</label>
          <input id="proposedPrice" type="number" min="1" step="500" required value={proposedPrice} onChange={e => setProposedPrice(e.target.value)} className="w-full border border-ink/20 rounded px-3 py-2 bg-white/60" placeholder="e.g. 20000" />
          <p className="text-xs text-ink/50 mt-1">Workers can accept this price or offer their own.</p>
        </div>
        {error && <p className="text-sm text-brick">Couldn't post job: {error}</p>}
        <button type="submit" disabled={submitting} className="px-5 py-3 bg-steel text-paper rounded font-medium hover:bg-steel-dark transition-colors disabled:opacity-60">
          {submitting ? 'Posting…' : 'Post job'}
        </button>
      </form>
    </div>
  );
}
