import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { firstName } from '../greeting.js';
import { formatRwf } from '../format.js';
import { categoryLabel, areaLabel, statusLabel } from '../options.js';
import {
  Avatar, Button, Card, FormField, JobStepper, PageLayout, StarRating, Switch, TextArea, TierBadge
} from '../components/ui/index.js';
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

  const counterpart = isClient ? job.worker : job.client;
  return (
    <PageLayout {...layout} title={job.description} subtitle={[counterpart?.name, areaLabel(job.area)].filter(Boolean).join(' · ')}>
      {job.status !== 'disputed' && <JobStepper status={job.status} />}

      {isClient && job.status === 'awaiting_confirmation' ? (
        <ConfirmAndRate job={job} />
      ) : (
        <>
          <Card className="p-5">
            <p className="text-body font-medium text-forest">{statusLabel(job.status, user.role)}</p>
            <p className="text-small text-muted mt-3">{job.agreedPrice ? 'Agreed price' : isClient ? 'Your price' : "Client's price"}</p>
            <p className="text-title text-ink">{formatRwf(job.agreedPrice ?? job.proposedPrice)}</p>
            {job.depositAmount > 0 && <p className="text-body text-muted mt-1">Includes {formatRwf(job.depositAmount)} for materials first</p>}
            <JobActions job={job} role={user.role} onChange={load} />
          </Card>
          {!isClient && job.workerCompletedAt && <RateClient job={job} onRated={load} />}
        </>
      )}
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
                  <Link to={`/people/${r.worker._id}`} className="block text-card text-ink hover:underline">{r.worker.name}</Link>
                  <TierBadge tier={r.trustSource} />
                </div>
              </div>
              <div className="flex items-end justify-between gap-4 mt-4">
                <div className="min-w-0">
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

// Frame 08: the client confirms and rates in one step (FR-12). Rating is
// required; vouching (FR-17) and a comment are optional.
function ConfirmAndRate({ job }) {
  const navigate = useNavigate();
  const worker = firstName(job.worker);
  const [score, setScore] = useState(0);
  const [vouch, setVouch] = useState(false);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const confirm = async () => {
    if (!score) return setError(`Choose how many stars to give ${worker}.`);
    setError('');
    setBusy(true);
    try {
      await api(`/api/jobs/${job._id}/confirm`, { method: 'POST', body: JSON.stringify({ score, referred: vouch, comment }) });
      navigate('/my-jobs');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const reportProblem = async () => {
    if (!window.confirm('Report a problem with this job? It will be held for review.')) return;
    try {
      await api(`/api/jobs/${job._id}/dispute`, { method: 'POST' });
      navigate('/my-jobs');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <div className="bg-mint rounded-card p-5 mb-8">
        <p className="text-card text-forest">{worker} marked this job complete</p>
        <p className="text-body text-muted mt-1">Confirm to finish the job.</p>
        <p className="text-title text-forest mt-3">{formatRwf(job.agreedPrice)}</p>
        <p className="text-small text-muted">agreed price</p>
      </div>

      <h2 className="text-section text-ink mb-2">How was {worker}'s work?</h2>
      <StarRating value={score} onChange={setScore} label={`Rate ${worker}'s work`} />

      <Card className="flex items-start justify-between gap-4 p-5 mt-6">
        <div>
          <p id="vouch-label" className="text-card text-ink">Vouch for {worker}</p>
          <p className="text-body text-muted mt-1">Tell your network {worker} is someone you would hire again.</p>
        </div>
        <Switch checked={vouch} onChange={setVouch} aria-labelledby="vouch-label" />
      </Card>

      <FormField label="Comment (optional)" className="mt-6">
        {field => <TextArea {...field} value={comment} maxLength={500} onChange={e => setComment(e.target.value)} placeholder={`What should others know about ${worker}?`} />}
      </FormField>

      {error && <p className="text-small text-danger mt-4" role="alert">{error}</p>}
      <div className="mt-6 space-y-2">
        <Button onClick={confirm} disabled={busy}>{busy ? 'Confirming…' : 'Confirm job is done'}</Button>
        <Button variant="plain" onClick={reportProblem}>Report a problem</Button>
      </div>
    </>
  );
}

// The worker rates the client after marking complete, independently of the
// client's own confirmation (FR-12b).
function RateClient({ job, onRated }) {
  const client = firstName(job.client);
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (job.myRating) {
    return (
      <Card className="p-5 mt-3">
        <p className="text-body text-ink">You rated {client}</p>
        <StarRating readOnly value={job.myRating.score} />
      </Card>
    );
  }

  const send = async () => {
    if (!score) return setError(`Choose how many stars to give ${client}.`);
    setError('');
    setBusy(true);
    try {
      await api(`/api/jobs/${job._id}/rate-client`, { method: 'POST', body: JSON.stringify({ score, comment }) });
      onRated();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Card className="p-5 mt-3">
      <h2 className="text-section text-ink mb-2">How was working with {client}?</h2>
      <StarRating value={score} onChange={setScore} label={`Rate ${client}`} />
      <FormField label="Comment (optional)" className="mt-4">
        {field => <TextArea {...field} value={comment} maxLength={500} onChange={e => setComment(e.target.value)} />}
      </FormField>
      {error && <p className="text-small text-danger mt-3" role="alert">{error}</p>}
      <Button className="mt-4" onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Send rating'}</Button>
    </Card>
  );
}
