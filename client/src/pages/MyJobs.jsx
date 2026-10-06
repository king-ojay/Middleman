import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { formatRwf } from '../format.js';
import { categoryLabel, areaLabel, statusLabel } from '../options.js';
import JobActions from '../components/JobActions.jsx';

// Client: the jobs they posted. Worker: the jobs they were chosen for.
// The next step for each job is a button right here, so no flow needs more
// than a couple of taps from this page.
export default function MyJobs() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () =>
    api('/api/jobs/mine')
      .then(setJobs)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, [user]);

  const isClient = user.role === 'client';

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <h1 className="font-display text-3xl text-ink mb-2">My jobs</h1>
      <p className="text-ink/60 mb-8">
        {isClient ? 'Jobs you have posted.' : 'Jobs clients have chosen you for.'}
      </p>

      {loading && <p className="text-sm text-ink/50">Loading…</p>}
      {error && <p className="text-sm text-brick">Couldn't load jobs: {error}</p>}
      {!loading && !error && jobs.length === 0 && (
        <p className="text-sm text-ink/60">
          {isClient ? <>You haven't posted any jobs yet. <Link to="/post-job" className="underline">Post a job</Link></> : 'No clients have chosen you yet. Respond to open jobs to get hired.'}
        </p>
      )}

      <div className="space-y-3">
        {jobs.map(job => (
          <div key={job._id} className="bg-white/50 border border-ink/10 rounded-sm px-5 py-4">
            <div className="flex items-start justify-between gap-6">
              <div>
                <h3 className="font-medium text-ink">
                  <Link to={`/my-jobs/${job._id}`} className="hover:underline">{job.description}</Link>
                </h3>
                <p className="text-sm text-ink/60 mt-1">
                  {categoryLabel(job.category)} · {areaLabel(job.area)} ·{' '}
                  {isClient ? (job.worker ? `Worker: ${job.worker.name}` : `${job.responseCount} response${job.responseCount === 1 ? '' : 's'}`) : `Client: ${job.client?.name}`}
                </p>
                <p className="text-sm text-ink mt-1">{statusLabel(job.status, user.role)}</p>
              </div>
              <p className="font-medium text-ink shrink-0">{formatRwf(job.agreedPrice ?? job.proposedPrice)}</p>
            </div>
            {isClient && job.status === 'open' && job.responseCount > 0 && (
              <Link to={`/my-jobs/${job._id}`} className="inline-block mt-3 px-4 py-2 text-sm font-medium bg-steel text-paper rounded hover:bg-steel-dark transition-colors">
                See responses and choose
              </Link>
            )}
            <JobActions job={job} role={user.role} onChange={load} />
          </div>
        ))}
      </div>
    </div>
  );
}
