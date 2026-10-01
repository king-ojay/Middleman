import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function PostJob() {
  const { user } = useAuth();
  const [category, setCategory] = useState('electrician');
  const [description, setDescription] = useState('');
  const [area, setArea] = useState(user.area);
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
        body: JSON.stringify({ client: user._id, category, description, area })
      });
      setPosted(job);
      setDescription('');
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

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="category" className="block text-sm font-medium text-ink mb-1">Category</label>
          <select id="category" value={category} onChange={e => setCategory(e.target.value)} className="w-full border border-ink/20 rounded px-3 py-2 bg-white/60">
            <option value="electrician">Electrician</option>
            <option value="mason">Mason</option>
            <option value="plumber">Plumber</option>
            <option value="cleaner">Cleaner</option>
            <option value="mechanic">Mechanic</option>
          </select>
        </div>
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-ink mb-1">Description</label>
          <textarea id="description" rows={4} required value={description} onChange={e => setDescription(e.target.value)} className="w-full border border-ink/20 rounded px-3 py-2 bg-white/60" placeholder="e.g. Kitchen tap is leaking, needs replacing" />
        </div>
        <div>
          <label htmlFor="area" className="block text-sm font-medium text-ink mb-1">Area</label>
          <select id="area" value={area} onChange={e => setArea(e.target.value)} className="w-full border border-ink/20 rounded px-3 py-2 bg-white/60">
            <option value="kimironko">Kimironko</option>
            <option value="kwa_nayinzira">Kwa Nayinzira</option>
            <option value="remera">Remera</option>
            <option value="gikondo">Gikondo</option>
          </select>
        </div>
        {error && <p className="text-sm text-brick">Couldn't post job: {error}</p>}
        {posted && (
          <p className="text-sm text-leaf">
            Job posted. <span className="capitalize">{posted.category}s</span> in{' '}
            <span className="capitalize">{posted.area.replace('_', ' ')}</span> can now see it.
          </p>
        )}
        <button type="submit" disabled={submitting} className="px-5 py-3 bg-steel text-paper rounded font-medium hover:bg-steel-dark transition-colors disabled:opacity-60">
          {submitting ? 'Posting…' : 'Post job'}
        </button>
      </form>
    </div>
  );
}
