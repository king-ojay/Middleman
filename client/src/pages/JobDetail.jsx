// One job: for the client, offers ranked by trust, escrow payment, and confirm
// and rate; for the worker, their offer, start/complete, and rating the client.
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { firstName } from '../greeting.js';
import { formatRwf } from '../format.js';
import { categoryLabel, areaLabel, escrowLabel, statusLabel } from '../options.js';
import {
  Avatar, Button, Card, FormField, JobStepper, LoadingState, PageLayout, Skeleton, SkeletonText, StarRating, Switch, TextArea,
  VerifiedBadge
} from '../components/ui/index.js';
import JobActions from '../components/JobActions.jsx';
import LoadError from '../components/LoadError.jsx';
import RankedItem from '../components/RankedItem.jsx';
import ProfileButton from '../components/ProfileButton.jsx';
import { reasonSentence, topLabel } from '../trustReason.js';

const POLL_EVERY_MS = 5000;
const POLL_FOR_MS = 2 * 60 * 1000;

export default function JobDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  // "See offers" links say so (state.offers), so the skeleton can take the offers' shape.
  const expectOffers = Boolean(useLocation().state?.offers);
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const [retrying, setRetrying] = useState(false);

  const load = () => api(`/api/jobs/${id}`).then(data => { setJob(data); setError(null); }).catch(setError);
  useEffect(() => { load(); }, [id]);
  // "Try again" re-runs the same request; the error stays up while it runs.
  const tryAgain = () => {
    setRetrying(true);
    load().finally(() => setRetrying(false));
  };

  // A payment or payout waiting on the provider: check on it every few
  // seconds (the fallback when no callback arrives), then reload. After
  // POLL_FOR_MS it stops and the person checks with a button instead; the
  // server cancels a payment that is never approved (escrow.js FUND_EXPIRY_MS).
  const pending = Boolean(job?.escrow?.pending);
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    setStalled(false);
    if (!pending) return;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started >= POLL_FOR_MS) {
        clearInterval(timer);
        setStalled(true);
        return;
      }
      api(`/api/jobs/${id}/escrow/sync`, { method: 'POST' }).then(load).catch(() => {});
    }, POLL_EVERY_MS);
    return () => clearInterval(timer);
  }, [id, pending]);

  const isClient = user.role === 'client';
  const layout = { back: '/my-jobs', tabBar: true, role: user.role, width: 'medium' };

  if (error) return <PageLayout {...layout} title="Job"><LoadError prefix="Couldn't load this job" error={error} retrying={retrying} onRetry={tryAgain} /></PageLayout>;
  if (!job && isClient && expectOffers) return <PageLayout {...layout} title="Offers for your job"><OffersSkeleton /></PageLayout>;
  if (!job) return <PageLayout {...layout}><JobSkeleton /></PageLayout>;

  if (isClient && job.status === 'open') {
    return (
      <PageLayout {...layout} title="Offers for your job">
        <div className="bg-mint rounded-card p-5 flex items-center justify-between gap-4 mb-6">
          <div className="min-w-0">
            <h2 className="text-card text-heading">{job.description}</h2>
            <p className="text-body text-muted">{categoryLabel(job.category)} · {areaLabel(job.area)}</p>
          </div>
          {/* the label sits with the amount it describes */}
          <div className="shrink-0 text-right">
            <p className="text-small text-muted">Your price</p>
            <p className="text-section text-heading whitespace-nowrap">{formatRwf(job.proposedPrice)}</p>
          </div>
        </div>
        <Offers job={job} onChosen={load} />
      </PageLayout>
    );
  }

  const counterpart = isClient ? job.worker : job.client;
  const paidOut = job.status === 'completed' && job.escrow?.status === 'released';
  // The client confirms (releasing escrow) and rates on one screen; it stays
  // until the rating is saved, which needs the payout to have gone through.
  const confirming = isClient && (job.status === 'awaiting_confirmation'
    || (job.status === 'completed' && !job.myRating && ['releasing', 'released'].includes(job.escrow?.status)));
  const escrowNote = escrowLabel(job.escrow, user.role);
  return (
    <PageLayout {...layout} title={job.description} subtitle={[counterpart?.name, areaLabel(job.area)].filter(Boolean).join(' · ')}>
      {!['disputed', 'resolved'].includes(job.status) && <JobStepper status={job.status} />}

      {confirming ? (
        <ConfirmAndRate job={job} onChange={load} stalled={stalled} />
      ) : (
        <>
          <Card className="p-5">
            <p className="text-body font-medium text-heading">{statusLabel(job.status, user.role)}</p>
            {escrowNote && <p className="text-body text-muted mt-1">{escrowNote}</p>}
            <p className="text-small text-muted mt-3">{job.agreedPrice ? 'Agreed price' : isClient ? 'Your price' : "Client's price"}</p>
            <p className="text-title text-ink">{formatRwf(job.agreedPrice ?? job.proposedPrice)}</p>
            {job.depositAmount > 0 && <p className="text-body text-muted mt-1">Needs {formatRwf(job.depositAmount)} upfront for materials</p>}
            <JobActions job={job} role={user.role} onChange={load} stalled={stalled} />
          </Card>
          {!isClient && paidOut && <RateClient job={job} onRated={load} />}
          {isClient && job.myRating && (
            <Card className="p-5 mt-3">
              <p className="text-body text-ink">You rated {firstName(job.worker)}</p>
              <StarRating readOnly value={job.myRating.score} />
            </Card>
          )}
        </>
      )}
    </PageLayout>
  );
}

// The shape of a job page before we know which one it is: title, who and
// where, the progress steps, and the status card with its price and action.
function JobSkeleton() {
  return (
    <LoadingState label="Loading job">
      <div className="mb-6">
        <SkeletonText size="display" on="canvas" className="w-3/4" />
        <SkeletonText on="canvas" className="w-1/2 mt-2" />
      </div>
      <div className="flex mb-6">
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="flex-1 flex flex-col items-center">
            <Skeleton on="canvas" className="w-6 h-6 rounded-full" />
            <SkeletonText size="small" on="canvas" className="w-12 mt-2" />
          </div>
        ))}
      </div>
      <Card className="p-5">
        <SkeletonText className="w-2/3" />
        <SkeletonText className="w-1/2 mt-1" />
        <SkeletonText size="small" className="w-24 mt-3" />
        <SkeletonText size="title" className="w-36" />
        <Skeleton className="h-14 w-full mt-4 rounded-full" />
      </Card>
    </LoadingState>
  );
}

// The shape of the open-job page with offers: the mint job summary, the
// note, and offer cards in one column.
function OffersSkeleton() {
  return (
    <LoadingState label="Loading offers">
      <Skeleton on="canvas" className="h-[88px] w-full rounded-card mb-6" />
      <div>
        <SkeletonText on="canvas" className="w-56" />
        <SkeletonText on="canvas" className="w-72 mb-3" />
        <ul className="grid gap-3">
          {[0, 1, 2].map(i => (
            <Card as="li" key={i} className="p-5">
              <div className="flex items-start gap-3">
                <Skeleton className="w-11 h-11 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1">
                  <SkeletonText size="card" className="w-1/2" />
                  <SkeletonText className="w-1/3" />
                  <SkeletonText className="w-full mt-1" />
                </div>
              </div>
              <div className="flex items-end justify-between gap-4 pt-4">
                <div className="flex-1">
                  <SkeletonText size="title" className="w-32" />
                  <SkeletonText className="w-24" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-11 w-32 rounded-full" />
                  <Skeleton className="h-11 w-24 rounded-full" />
                </div>
              </div>
            </Card>
          ))}
        </ul>
      </div>
    </LoadingState>
  );
}

// "Your price", "2,000 RWF more" or "1,500 RWF less" than the client's price.
const comparedWithYours = (amount, proposed) =>
  amount === proposed ? 'Your price' : `${formatRwf(Math.abs(amount - proposed))} ${amount > proposed ? 'more' : 'less'}`;

// Every worker response to the client's price, in trust order (FR-05b), each
// with why that worker ranks there. The first gets the emphasised card when
// they are trusted through the network or the area.
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
      <p className="text-body text-muted">Ranked by trust in your network</p>
      <p className="text-body text-muted mb-3">Choosing an offer fixes the price. You then pay it into escrow.</p>
      {error && <p className="text-body text-danger mb-3" role="alert">{error}</p>}
      <ul className="grid gap-3">
        {job.responses.map((r, i) => {
          const label = i === 0 ? topLabel(r.reason) : null;
          return (
            <RankedItem key={r._id} highlighted={Boolean(label)} className="p-5">
              {label && <p className="text-label font-semibold text-heading mb-2">{label}</p>}
              <div className="flex items-start gap-3">
                <Avatar name={r.worker.name} tier={r.trustSource} size={44} />
                <div className="min-w-0">
                  <Link to={`/people/${r.worker._id}`} className="block text-card text-ink hover:underline">{r.worker.name}</Link>
                  <p className="text-body text-muted">{(r.worker.skills || []).map(categoryLabel).join(', ')} · {areaLabel(r.worker.area)}</p>
                  <p className="text-body text-ink mt-1">{reasonSentence(r.reason)}</p>
                  {r.worker.verifiedStatus === 'verified' && <div className="mt-2"><VerifiedBadge /></div>}
                </div>
              </div>
              {/* On a phone the buttons wrap under the amount rather than squeeze it. */}
              <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 pt-4">
                <div className="shrink-0">
                  <p className="text-title text-ink whitespace-nowrap">{formatRwf(r.amount)}</p>
                  <p className="text-body font-medium text-heading">{comparedWithYours(r.amount, job.proposedPrice)}</p>
                  {r.depositAmount > 0 && <p className="text-body text-muted">Needs {formatRwf(r.depositAmount)} upfront for materials</p>}
                </div>
                {/* Choose stays the main action; View profile sits beside it in outline. */}
                <div className="flex flex-wrap justify-end gap-2 ml-auto">
                  <ProfileButton worker={r.worker} />
                  <Button size="md" disabled={choosing !== null} onClick={() => choose(r._id)}>
                    {choosing === r._id ? 'Choosing…' : 'Choose'}
                  </Button>
                </div>
              </div>
            </RankedItem>
          );
        })}
      </ul>
    </>
  );
}

// Frame 08: the client confirms and rates in one step (FR-12). Rating is
// required; vouching (FR-17) and a comment are optional.
function ConfirmAndRate({ job, onChange, stalled }) {
  const navigate = useNavigate();
  const worker = firstName(job.worker);
  const [score, setScore] = useState(0);
  const [vouch, setVouch] = useState(false);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirmed = job.status === 'completed';
  const paying = job.escrow?.status === 'releasing';
  // A payout that failed while this screen was polling puts the job back here.
  const payoutFailed = !confirmed && !job.escrow?.pending && job.escrow?.lastFailure?.kind === 'release';

  // Confirming releases escrow to the worker; the rating is saved once the
  // payout has gone through. While it is on its way the screen stays, and
  // sending again (once it has arrived) saves the rating.
  const confirm = async () => {
    if (!score) return setError(`Choose how many stars to give ${worker}.`);
    setError('');
    setBusy(true);
    try {
      const result = await api(`/api/jobs/${job._id}/confirm`, { method: 'POST', body: JSON.stringify({ score, referred: vouch, comment }) });
      if (result.myRating) return navigate('/my-jobs');
      setBusy(false);
      onChange();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const reportProblem = async () => {
    if (!window.confirm('Report a problem with this job? The payment stays locked until it is reviewed.')) return;
    setError('');
    setBusy(true);
    try {
      await api(`/api/jobs/${job._id}/dispute`, { method: 'POST' });
      navigate('/my-jobs');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <>
      <div className="bg-mint rounded-card p-5 mb-8">
        <p className="text-card text-heading">{confirmed ? 'You confirmed this job' : `${worker} marked this job complete`}</p>
        <p className="text-body text-muted mt-1">
          {paying ? `Paying ${worker} from escrow… You can send your rating once the payment arrives.`
            : confirmed ? `${worker} has been paid. Send your rating to finish.`
            : `Confirming pays ${worker} from escrow.`}
        </p>
        <p className="text-title text-heading mt-3">{formatRwf(job.agreedPrice)}</p>
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

      {(error || payoutFailed) && (
        <p className="text-small text-danger mt-4" role="alert">
          {error || "The payment to the worker didn't go through. The money is still held. Please try again."}
        </p>
      )}
      <div className="mt-6 space-y-2">
        <Button onClick={confirm} disabled={busy || paying}>
          {busy ? 'Sending…' : confirmed ? 'Send rating' : 'Confirm job is done'}
        </Button>
        {paying && stalled && <JobActions job={job} role="client" onChange={onChange} stalled />}
        {!confirmed && <Button variant="plain" onClick={reportProblem} disabled={busy}>Report a problem</Button>}
      </div>
    </>
  );
}

// The worker rates the client (FR-12b) once the client has confirmed and the
// escrow has been released to the worker.
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