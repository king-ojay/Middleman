import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { formatRwf } from '../format.js';
import { categoryLabel, areaLabel, statusLabel } from '../options.js';
import { Avatar, Button, Card, JobStepper, PageLayout, TierBadge } from '../components/ui/index.js';
import JobActions from '../components/JobActions.jsx';

export default function JobDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');

  const load = () => api(`/api/jobs/${id}`).then(setJob).catch(err => setError(err.message));
  useEffect(() => { load(); }, [id]);

  const isClient = user.role === 'client';
  const layout = { back: '/my-jobs', tabBar: true, role: user.role };

  if (error) return <PageLayout {...layout} title="Job"><p className="text-body text-danger" role="alert">Couldn't load this job: {error}</p></PageLayout>;
  if (!job) return <PageLayout {...layout} title="Job"><p className="text-body text-muted">Loading…</p></PageLayout>;

  if (isClient && job.status === 'open') {
    return (
      <PageLayout {...layout} title="Offers for your job">
        <div className="bg-mint rounded-card p-5 flex items-center justify-between gap-4 mb-6">
          <div className="min-w-0">
            <h2 className="text-card text-forest">{job.description}</h2>
            <p className="text-body text-muted">{categoryLabel(job.category)} · {areaLabel(job.area)}</p>
            <p className="text-small text-muted mt-1">Your price</p>
          </div>
          <p className="text-section text-forest shrink-0">{formatRwf(job.proposedPrice)}</p>
        </div>
        <Offers job={job} onChosen={load} />
      </PageLayout>
    );
  }

  const counterpart = isClient ? job.worker?.name : job.client?.name;
  return (
    <PageLayout {...layout} title={job.description} subtitle={[counterpart, areaLabel(job.area)].filter(Boolean).join(' · ')}>
      {job.status !== 'open' && job.status !== 'disputed' && <JobStepper status={job.status} />}
      <Card className="p-5">
        <p className="text-body font-medium text-forest">{statusLabel(job.status, user.role)}</p>
        <p className="text-small text-muted mt-3">{job.agreedPrice ? 'Agreed price' : isClient ? 'Your price' : "Client's price"}</p>
        <p className="text-title text-ink">{formatRwf(job.agreedPrice ?? job.proposedPrice)}</p>
        {job.depositAmount > 0 && <p className="text-body text-muted mt-1">Includes {formatRwf(job.depositAmount)} for materials first</p>}
        <JobActions job={job} role={user.role} onChange={load} />
      </Card>
    </PageLayout>
  );
}

// Every worker response to the client's price, ranked by trust (FR-05b).
function Offers({ job, onChosen }) {
  const [choosing, setChoosing] = useState(null);
  const [error, setError] = useState('');

  const choose = async quoteId => {
    setError('');
    setChoosing(quoteId);
    try {
      await api(`/api/jobs/${job._id}/select`, { method: 'POST', body: JSON.stringify({ quoteId }) });
      onChosen();
    } catch (err) {
      setError(err.message);
      setChoosing(null);
    }
  };

  if (job.responses.length === 0) {
    return <p className="text-body text-muted">No offers yet. Workers nearby can see your job and their offers will appear here.</p>;
  }

  return (
    <>
      <p className="text-body text-muted mb-3">Ranked by trust in your network</p>
      {error && <p className="text-body text-danger mb-3" role="alert">{error}</p>}
      <ul className="space-y-3">
        {job.responses.map(r => {
          const difference = r.amount - job.proposedPrice;
          return (
            <Card as="li" key={r._id} className="p-5">
              <div className="flex items-center gap-3">
                <Avatar name={r.worker.name} tier={r.trustSource} size={44} />
                <div className="min-w-0">
                  <h3 className="text-card text-ink">{r.worker.name}</h3>
                  <TierBadge tier={r.trustSource} />
                </div>
              </div>
              <div className="flex items-end justify-between gap-4 mt-4">
                <div>
                  <p className="text-title text-ink">{formatRwf(r.amount)}</p>
                  <p className="text-body font-medium text-forest">
                    {r.isCounter ? `Counter-offer · ${difference > 0 ? '+' : '−'}${formatRwf(Math.abs(difference))}` : 'Accepts your price'}
                  </p>
                  {r.depositAmount > 0 && <p className="text-small text-muted">Asks {formatRwf(r.depositAmount)} for materials first</p>}
                </div>
                <Button size="md" className="shrink-0" disabled={choosing !== null} onClick={() => choose(r._id)}>
                  {choosing === r._id ? 'Choosing…' : 'Choose'}
                </Button>
              </div>
            </Card>
          );
        })}
      </ul>
    </>
  );
}
