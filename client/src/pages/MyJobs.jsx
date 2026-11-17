import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { formatRwf } from '../format.js';
import { deletedUser } from '../greeting.js';
import { t } from '../i18n/index.js';
import { JOB_GROUPS, categoryLabel, areaLabel, moneyLabel, statusChip } from '../options.js';
import { Badge, Button, Card, LoadingState, PageLayout, Skeleton, SkeletonText } from '../components/ui/index.js';
import JobActions from '../components/JobActions.jsx';
import LoadError from '../components/LoadError.jsx';

// Client: the jobs they posted. Worker: the jobs they were chosen for.
// Grouped by status in tabs; each card shows where the job and its money
// are, and the one next step as a button. The chosen tab lives in the URL
// (?tab=), so going back from a job returns to it.
export default function MyJobs() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const [params, setParams] = useSearchParams();

  const load = () =>
    api('/api/jobs/mine')
      .then(data => { setJobs(data); setError(null); })
      .catch(setError)
      .finally(() => setLoading(false));
  // "Try again" re-runs the same request; the error stays up while it runs.
  const tryAgain = () => {
    setRetrying(true);
    load().finally(() => setRetrying(false));
  };

  useEffect(() => { load(); }, [user]);

  const role = user.role;
  const isClient = role === 'client';
  const groups = JOB_GROUPS.filter(g => g.roles.includes(role)).map(g => ({ ...g, jobs: jobs.filter(j => g.statuses.includes(j.status)) }));
  // Open on the tab given in the URL, else where something needs doing, else the first with jobs.
  const fallback = groups.find(g => g.jobs.some(j => statusChip(j, role).tone === 'action')) || groups.find(g => g.jobs.length) || groups[0];
  const current = groups.find(g => g.key === params.get('tab')) || fallback;
  const showTab = key => setParams({ tab: key }, { replace: true });
  // On phones the tabs scroll sideways: keep the chosen one in view.
  const selectedTab = useRef(null);
  useEffect(() => { selectedTab.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }, [current.key, loading]);

  return (
    <PageLayout
      title={t(`myJobs.title.${role}`)}
      subtitle={t(`myJobs.sub.${role}`)}
      tabBar
      role={role}
    >
      {loading && (
        <LoadingState label={t('jobs.loading')}>
          <div className="py-1 mb-5 flex gap-2 overflow-hidden">
            {[0, 1, 2, 3].map(i => <Skeleton key={i} on="canvas" className="h-11 w-28 shrink-0 rounded-full" />)}
          </div>
          <ul className="grid gap-3 md:grid-cols-2">
            {[0, 1, 2].map(i => <JobCardSkeleton key={i} />)}
          </ul>
        </LoadingState>
      )}
      {error && <LoadError prefix={t('myJobs.loadError')} error={error} retrying={retrying} onRetry={tryAgain} />}

      {!loading && !error && jobs.length === 0 && (
        isClient
          ? <EmptyState text={t('myJobs.empty.client')} action={<Button to="/post-job">{t('myJobs.postJob')}</Button>} />
          : <EmptyState text={t('myJobs.empty.worker')} action={<Button to="/jobs">{t('myJobs.findJobs')}</Button>} />
      )}

      {!loading && !error && jobs.length > 0 && (
        <>
          <div
            role="tablist"
            aria-label={t('myJobs.tabs')}
            className="-mx-screen px-screen py-1 mb-5 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:px-0 md:flex-wrap md:overflow-visible"
          >
            {groups.map(g => {
              const selected = g.key === current.key;
              return (
                <button
                  key={g.key}
                  ref={selected ? selectedTab : null}
                  type="button"
                  role="tab"
                  id={`tab-${g.key}`}
                  aria-selected={selected}
                  aria-controls="job-group"
                  onClick={() => showTab(g.key)}
                  className={`inline-flex items-center gap-2 h-11 shrink-0 px-4 rounded-full text-label whitespace-nowrap transition-colors ${
                    selected ? 'bg-primary text-on-primary' : 'bg-surface border border-line text-ink hover:border-primary'
                  }`}
                >
                  {g.label}
                  <span className={`min-w-6 h-6 px-1.5 rounded-full inline-flex items-center justify-center text-micro ${selected ? 'bg-on-primary/20' : 'bg-soft text-muted'}`}>
                    {g.jobs.length}
                  </span>
                </button>
              );
            })}
          </div>

          <section id="job-group" role="tabpanel" aria-labelledby={`tab-${current.key}`}>
            {current.jobs.length === 0
              ? <GroupEmpty group={current.key} role={role} groups={groups} showTab={showTab} />
              : (
                <ul className="grid gap-3 md:grid-cols-2">
                  {current.jobs.map(job => <JobCard key={job._id} job={job} role={role} onChange={load} />)}
                </ul>
              )}
          </section>
        </>
      )}
    </PageLayout>
  );
}

// Status chip tones (options.js statusChip) as Badge tones.
const CHIP_TONES = { action: 'action', wait: 'soft', done: 'trust', problem: 'problem' };

function JobCard({ job, role, onChange }) {
  const isClient = role === 'client';
  const chip = statusChip(job, role);
  const money = moneyLabel(job, role);
  const price = job.agreedPrice ?? job.proposedPrice;
  // Nobody chosen yet on an open job; a missing person otherwise deleted their account.
  const who = isClient
    ? (job.worker ? job.worker.name : job.status === 'open' ? null : deletedUser())
    : job.client?.name || deletedUser();

  return (
    <Card as="li" className="p-5 flex flex-col gap-4">
      <div>
        <Badge tone={CHIP_TONES[chip.tone]}>{chip.label}</Badge>
        <h2 className="text-card text-ink mt-3 break-words">
          <Link to={`/my-jobs/${job._id}`} state={offersState(job, role)} className="hover:underline">{job.description}</Link>
        </h2>
        <p className="text-body text-muted mt-1 break-words">
          {categoryLabel(job.category)} · {areaLabel(job.area)}{who ? ` · ${who}` : ''}
        </p>
      </div>

      {/* mt-auto: in a row of cards, prices and buttons line up at the bottom */}
      <div className="mt-auto flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <p className="text-small text-muted">{job.agreedPrice != null ? t('myJobs.agreedPrice') : t('myJobs.yourPrice')}</p>
          <p className="text-card font-bold text-ink whitespace-nowrap">{formatRwf(price)}</p>
        </div>
        {money && (
          <p className="text-label text-ink inline-flex items-center gap-2">
            <span aria-hidden="true" className={`w-2 h-2 rounded-full ${job.escrow?.status === 'released' ? 'bg-signal' : job.escrow?.status === 'held' ? 'bg-ink' : 'bg-faint'}`} />
            <span className="sr-only">{t('myJobs.money')}</span>{money}
          </p>
        )}
      </div>

      <NextStep job={job} role={role} onChange={onChange} />
    </Card>
  );
}

// The shape of a job card: status, description, trade · area, price and the
// next-step button.
function JobCardSkeleton() {
  return (
    <Card as="li" className="p-5 flex flex-col gap-4">
      <div>
        <Skeleton className="w-24 h-[26px] rounded-full" />
        <SkeletonText size="card" className="w-3/4 mt-3" />
        <SkeletonText className="w-1/2 mt-1" />
      </div>
      <div className="mt-auto">
        <SkeletonText size="small" className="w-20" />
        <SkeletonText size="section" className="w-28" />
      </div>
      <Skeleton className="h-14 w-full rounded-full" />
    </Card>
  );
}

// The one next step for this job, or a way into it when there is nothing to do.
function NextStep({ job, role, onChange }) {
  const to = `/my-jobs/${job._id}`;
  const released = job.escrow?.status === 'released';
  if (role === 'client' && job.status === 'open' && job.responseCount > 0) return <Button to={to} state={offersState(job, role)}>{t('post.seeOffers')}</Button>;
  if (job.status === 'completed' && released && !job.rated && job[role === 'client' ? 'worker' : 'client']) {
    return <Button to={to}>{role === 'client' ? t('myJobs.sendRating') : t('myJobs.rateClient')}</Button>;
  }
  if (job.escrow?.pending || hasPrimaryAction(job, role)) return <JobActions job={job} role={role} onChange={onChange} primaryOnly />;
  return <Button to={to} variant="outline">{t('myJobs.viewJob')}</Button>;
}

// Tells the job page it is opening on offers, so its skeleton takes their shape.
const offersState = (job, role) => (role === 'client' && job.status === 'open' ? { offers: true } : undefined);

const PRIMARY = { client: ['quote_accepted', 'awaiting_confirmation'], worker: ['escrow_held', 'in_progress'] };
const hasPrimaryAction = (job, role) => PRIMARY[role].includes(job.status);

function EmptyState({ text, action }) {
  return (
    <Card className="p-6 text-center flex flex-col items-center gap-4">
      <p className="text-body text-muted max-w-sm">{text}</p>
      <div className="w-full max-w-xs">{action}</div>
    </Card>
  );
}

// An empty tab: a friendly line and one suggested next step.
function GroupEmpty({ group, role, groups, showTab }) {
  const has = key => groups.find(g => g.key === key)?.jobs.length > 0;
  const go = (key, label) => <Button variant="outline" onClick={() => showTab(key)}>{label}</Button>;
  const isClient = role === 'client';
  const findWork = isClient ? <Button to="/post-job">{t('myJobs.postJob')}</Button> : <Button to="/jobs">{t('myJobs.findJobs')}</Button>;
  const seeActive = t(isClient ? 'myJobs.seeActiveJobs' : 'myJobs.seeActiveWork');

  const content = {
    waiting: [t('myJobs.groupEmpty.waiting'), <Button to="/post-job">{t('myJobs.postJob')}</Button>],
    active: isClient
      ? [t('myJobs.groupEmpty.active.client'), has('waiting') ? go('waiting', t('myJobs.seeWaiting')) : findWork]
      : [t('myJobs.groupEmpty.active.worker'), findWork],
    confirm: [t(`myJobs.groupEmpty.confirm.${role}`), has('active') ? go('active', seeActive) : findWork],
    completed: [t('myJobs.groupEmpty.completed'), has('active') ? go('active', seeActive) : findWork],
    disputed: [t('myJobs.groupEmpty.disputed'), go(has('active') ? 'active' : groups[0].key, t('myJobs.backToMyJobs'))]
  }[group];

  return <EmptyState text={content[0]} action={content[1]} />;
}
