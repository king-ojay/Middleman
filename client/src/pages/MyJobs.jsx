import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { formatRwf } from '../format.js';
import { categoryLabel, areaLabel, statusLabel } from '../options.js';
import { Button, Card, PageLayout } from '../components/ui/index.js';
import JobActions from '../components/JobActions.jsx';

// Client: the jobs they posted. Worker: the jobs they were chosen for.
// The next step for each job is a button right here.
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
    <PageLayout
      title={isClient ? 'My jobs' : 'My work'}
      subtitle={isClient ? 'Jobs you have posted.' : 'Jobs clients have chosen you for.'}
      tabBar
      role={user.role}
    >
      {loading && <p className="text-body text-muted">Loading…</p>}
      {error && <p className="text-body text-danger" role="alert">Couldn't load jobs: {error}</p>}
      {!loading && !error && jobs.length === 0 && (
        isClient
          ? <div className="space-y-4"><p className="text-body text-muted">You haven't posted any jobs yet.</p><Button to="/post-job">Post a job</Button></div>
          : <p className="text-body text-muted">No clients have chosen you yet. Respond to jobs near you to get hired.</p>
      )}

      <ul className="space-y-3">
        {jobs.map(job => (
          <Card as="li" key={job._id} className="p-5">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-card text-ink min-w-0">
                <Link to={`/my-jobs/${job._id}`} className="hover:underline">{job.description}</Link>
              </h2>
              <p className="text-card text-ink shrink-0">{formatRwf(job.agreedPrice ?? job.proposedPrice)}</p>
            </div>
            <p className="text-body text-muted mt-1">
              {categoryLabel(job.category)} · {areaLabel(job.area)} ·{' '}
              {isClient
                ? (job.worker ? job.worker.name : `${job.responseCount} offer${job.responseCount === 1 ? '' : 's'}`)
                : job.client?.name}
            </p>
            <p className="text-body font-medium text-forest mt-2">{statusLabel(job.status, user.role)}</p>
            {isClient && job.status === 'open' && job.responseCount > 0 && (
              <Button to={`/my-jobs/${job._id}`} className="mt-4">See offers</Button>
            )}
            <JobActions job={job} role={user.role} onChange={load} />
          </Card>
        ))}
      </ul>
    </PageLayout>
  );
}
