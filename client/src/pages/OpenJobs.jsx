import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { formatBudget } from '../format.js';
import { categoryLabel, areaLabel } from '../options.js';


// Worker home: read-only list of open jobs in the worker's area that match
// one of their skills. Quote submission isn't built yet.
export default function OpenJobs() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams({ status: 'open', area: user.area, category: (user.skills || []).join(',') });
    api(`/api/jobs?${params}`)
      .then(setJobs)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [user]);

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
          <div key={job._id} className="flex items-center justify-between gap-6 bg-white/50 border border-ink/10 rounded-sm px-5 py-4">
            <div>
              <h3 className="font-medium text-ink">{job.description}</h3>
              <p className="text-sm text-ink/60 mt-1">
                {categoryLabel(job.category)} · {areaLabel(job.area)} · {formatBudget(job.budget)} · posted by {job.client?.name} on {new Date(job.createdAt).toLocaleDateString()}
              </p>
            </div>
            <button disabled title="Quote submission coming soon" className="px-4 py-2 text-sm font-medium border border-ink/20 rounded shrink-0 opacity-50 cursor-not-allowed">
              Submit quote
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
