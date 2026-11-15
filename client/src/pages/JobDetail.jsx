// One job: for the client, offers ranked by trust, escrow payment, and confirm
// and rate; for the worker, their offer, start/complete, and rating the client.
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { DELETED_USER, firstName } from '../greeting.js';
import { formatRwf, timeAgo } from '../format.js';
import { categoryLabel, areaLabel, escrowLabel, statusLabel } from '../options.js';
import {
  Avatar, Badge, Button, Card, FormField, JobStepper, LoadingState, PageLayout, Skeleton, SkeletonText, StarRating, Switch, TextArea,
  VerifiedBadge
} from '../components/ui/index.js';
import JobActions from '../components/JobActions.jsx';
import ReportProblem from '../components/ReportProblem.jsx';
import DisputeSummary from '../components/DisputeSummary.jsx';
import LoadError from '../components/LoadError.jsx';
import TrustPath from '../components/TrustPath.jsx';
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
  if (!job && isClient && expectOffers) return <PageLayout {...layout}><OffersSkeleton /></PageLayout>;
  if (!job) return <PageLayout {...layout}><JobSkeleton /></PageLayout>;

  if (isClient && job.status === 'open') {
    return (
      <PageLayout {...layout} eyebrow="Offers for your job" title={job.description} subtitle={`${categoryLabel(job.category)} · ${areaLabel(job.area)}`}>
        <div className="-mt-2 mb-6">
          <p className="text-small text-muted">Your price</p>
          <p className="text-amount-xl text-ink whitespace-nowrap">{formatRwf(job.proposedPrice)}</p>
        </div>
        <Offers job={job} onChosen={load} />
      </PageLayout>
    );
  }

  const counterpart = isClient ? job.worker : job.client;
  const paidOut = job.status === 'completed' && job.escrow?.status === 'released';
  // The client confirms (releasing escrow) and rates on one screen; it stays
  // until the rating is saved, which needs the payout to have gone through.
  // Someone who has deleted their account can't be rated (or shown by name).
  const gone = !counterpart;
  const confirming = isClient && (job.status === 'awaiting_confirmation'
    || (job.status === 'completed' && !job.myRating && !gone && ['releasing', 'released'].includes(job.escrow?.status)));
  const escrowNote = escrowLabel(job.escrow, user.role);
  return (
    <PageLayout {...layout} title={job.description} subtitle={[counterpart?.name || DELETED_USER, areaLabel(job.area)].join(' · ')}>
      {!['disputed', 'resolved'].includes(job.status) && <JobStepper status={job.status} />}

      {confirming ? (
        <ConfirmAndRate job={job} onChange={load} stalled={stalled} />
      ) : (
        <>
          <Card className="p-5">
            <p className="text-body font-medium text-ink">{statusLabel(job.status, user.role)}</p>
            {escrowNote && <p className="text-body text-muted mt-1">{escrowNote}</p>}
            <p className="text-small text-muted mt-3">{job.agreedPrice ? 'Agreed price' : isClient ? 'Your price' : "Client's price"}</p>
            <p className="text-amount text-ink">{formatRwf(job.agreedPrice ?? job.proposedPrice)}</p>
            {job.depositAmount > 0 && <p className="text-body text-muted mt-1">Needs {formatRwf(job.depositAmount)} upfront for materials</p>}
            <JobActions job={job} role={user.role} onChange={load} stalled={stalled} />
          </Card>
          {['disputed', 'resolved'].includes(job.status) && job.disputedAt && <ProblemReported job={job} userId={user._id} />}
          {!isClient && paidOut && !gone && <RateClient job={job} onRated={load} />}
          {gone && <p className="text-body text-muted mt-3">This person has deleted their account.</p>}
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

// Disputed or resolved: what was reported, by whom and when, for both parties.
function ProblemReported({ job, userId }) {
  const byClient = String(job.disputedBy) === String(job.client?._id);
  const reporter = !job.disputedBy ? null : String(job.disputedBy) === String(userId) ? 'you' : firstName(byClient ? job.client : job.worker);
  return (
    <Card className="p-5 mt-3">
      <p className="text-small text-muted">
        Problem reported{reporter ? ` by ${reporter}` : ''} · <time dateTime={job.disputedAt}>{timeAgo(job.disputedAt)}</time>
      </p>
      <DisputeSummary job={job} reporterRole={byClient ? 'client' : 'worker'} className="mt-2" />
    </Card>
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

// The shape of the open-job page with offers: the title, the price, the
// most trusted offer's large card, then smaller offer cards.
function OffersSkeleton() {
  return (
    <LoadingState label="Loading offers">
      <SkeletonText on="canvas" className="w-40" />
      <SkeletonText size="display" on="canvas" className="w-3/4" />
      <SkeletonText on="canvas" className="w-1/2 mt-2" />
      <SkeletonText size="small" on="canvas" className="w-20 mt-4" />
      <Skeleton on="canvas" className="h-11 w-48 mb-6 rounded-full" />
      <ul className="grid gap-3">
        <Card as="li" className="p-5">
          <Skeleton className="w-44 h-[26px] rounded-full" />
          <div className="flex items-center gap-3 mt-4">
            <Skeleton className="w-[52px] h-[52px] shrink-0 rounded-full" />
            <SkeletonText size="section" className="flex-1" />
            <SkeletonText size="title" className="w-28" />
          </div>
          <Skeleton className="h-[72px] w-full mt-4 rounded-tile" />
          <div className="grid grid-cols-3 gap-2 mt-4">
            <Skeleton className="h-14 rounded-full" />
            <Skeleton className="h-14 col-span-2 rounded-full" />
          </div>
        </Card>
        {[0, 1].map(i => (
          <Card as="li" key={i} className="p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="w-11 h-11 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <SkeletonText size="card" className="w-1/2" />
                <SkeletonText className="w-full mt-1" />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 mt-3">
              <SkeletonText size="card" className="w-40" />
              <Skeleton className="h-11 w-24 rounded-full" />
            </div>
          </Card>
        ))}
      </ul>
    </LoadingState>
  );
}

// How an offer compares with the client's price, as a small tinted label:
// the same ("Your price"), above it in amber, below it in green.
function PriceDifference({ amount, proposed, top = false }) {
  if (amount === proposed) return <Badge tone={top ? 'trust' : 'soft'}>{top ? 'Accepts your price' : 'Your price'}</Badge>;
  const more = amount > proposed;
  return <Badge tone={more ? 'action' : 'trust'}>{formatRwf(Math.abs(amount - proposed))} {more ? 'more' : 'less'}</Badge>;
}

const ShieldIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 mt-0.5">
    <path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" />
  </svg>
);

// Every worker response to the client's price, in trust order (FR-05b), each
// with why that worker ranks there. The first gets the large card when they
// are trusted through the network or the area.
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
      <h2 className="text-section text-ink mb-3">Ranked by trust in your network</h2>
      {error && <p className="text-body text-danger mb-3" role="alert">{error}</p>}
      <ul className="grid gap-3">
        {job.responses.map((r, i) => {
          const label = i === 0 ? topLabel(r.reason) : null;
          const props = { offer: r, job, busy: choosing !== null, choosing: choosing === r._id, onChoose: () => choose(r._id) };
          return label ? <TopOffer key={r._id} label={label} {...props} /> : <OfferCard key={r._id} {...props} />;
        })}
      </ul>
      <p className="flex items-start gap-2 text-body text-muted mt-5">
        <ShieldIcon />
        Choosing an offer fixes the price. You then pay it into escrow.
      </p>
    </>
  );
}

const Deposit = ({ offer }) => offer.depositAmount > 0
  ? <p className="text-body text-muted mt-2">Needs {formatRwf(offer.depositAmount)} upfront for materials</p>
  : null;

// The most trusted offer: chip and price comparison, who, the amount, the
// path and sentence on a grey inset, then "Profile" (a third) and "Choose".
function TopOffer({ offer: r, job, label, busy, choosing, onChoose }) {
  return (
    <Card as="li" className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="trust">{label}</Badge>
        <PriceDifference amount={r.amount} proposed={job.proposedPrice} top />
        {r.worker.verifiedStatus === 'verified' && <VerifiedBadge />}
      </div>
      <div className="flex items-center gap-3 mt-4">
        <Avatar name={r.worker.name} tier={r.trustSource} size={52} />
        <div className="min-w-0 flex-1">
          <Link to={`/people/${r.worker._id}`} className="block text-section text-ink hover:underline">{r.worker.name}</Link>
          <p className="text-small text-muted">{(r.worker.skills || []).map(categoryLabel).join(', ')} · {areaLabel(r.worker.area)}</p>
        </div>
      </div>
      <p className="text-amount text-ink whitespace-nowrap mt-4">{formatRwf(r.amount)}</p>
      <Deposit offer={r} />
      <div className="flex items-center gap-3 bg-soft rounded-tile p-3 mt-4">
        <TrustPath reason={r.reason} ring="ring-soft" />
        <p className="text-body text-ink">{reasonSentence(r.reason)}</p>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-4">
        <ProfileButton worker={r.worker} label="Profile" size="lg" />
        <Button className="col-span-2" disabled={busy} onClick={onChoose}>
          {choosing ? 'Choosing…' : `Choose ${firstName(r.worker)}`}
        </Button>
      </div>
    </Card>
  );
}

// Any other offer: who, why, the amount with how it compares, and "Choose".
function OfferCard({ offer: r, job, busy, choosing, onChoose }) {
  return (
    <Card as="li" className="p-4">
      <div className="flex items-start gap-3">
        <Avatar name={r.worker.name} tier={r.trustSource} size={44} />
        <div className="min-w-0 flex-1">
          <Link to={`/people/${r.worker._id}`} className="block text-card text-ink hover:underline">{r.worker.name}</Link>
          {r.worker.verifiedStatus === 'verified' && <div className="mt-1"><VerifiedBadge /></div>}
          <p className="text-body text-muted mt-1">{reasonSentence(r.reason)}</p>
          <Deposit offer={r} />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-card font-bold text-ink whitespace-nowrap">{formatRwf(r.amount)}</p>
          <PriceDifference amount={r.amount} proposed={job.proposedPrice} />
        </div>
        <Button variant="secondary" size="md" disabled={busy} onClick={onChoose}>
          {choosing ? 'Choosing…' : <>Choose<span className="sr-only"> {r.worker.name}</span></>}
        </Button>
      </div>
    </Card>
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

  const [reporting, setReporting] = useState(false);

  return (
    <>
      <div className="bg-trust text-on-trust rounded-card p-5 mb-8">
        <p className="text-card">{confirmed ? 'You confirmed this job' : `${worker} marked this job complete`}</p>
        <p className="text-body mt-1">
          {paying ? `Paying ${worker} from escrow… You can send your rating once the payment arrives.`
            : confirmed ? `${worker} has been paid. Send your rating to finish.`
            : `Confirming pays ${worker} from escrow.`}
        </p>
        <p className="text-amount mt-3">{formatRwf(job.agreedPrice)}</p>
        <p className="text-small">agreed price</p>
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
        {!confirmed && <Button variant="plain" onClick={() => setReporting(true)} disabled={busy}>Report a problem</Button>}
      </div>
      <ReportProblem job={job} role="client" open={reporting} onClose={() => setReporting(false)} onReported={() => navigate('/my-jobs')} />
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