import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { formatRwf } from '../format.js';
import { JOB_GROUPS, categoryLabel, areaLabel, moneyLabel, statusChip } from '../options.js';
import { Badge, Button, Card, PageLayout } from '../components/ui/index.js';
import JobActions from '../components/JobActions.jsx';

// Client: the jobs they posted. Worker: the jobs they were chosen for.
// Grouped by status in tabs; each card shows where the job and its money
// are, and the one next step as a button. The chosen tab lives in the URL
// (?tab=), so going back from a job returns to it.
export default function MyJobs() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [params, setParams] = useSearchParams();

  const load = () =>
    api('/api/jobs/mine')
      .then(setJobs)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));

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
      title={isClient ? 'My jobs' : 'My work'}
      subtitle={isClient ? 'Jobs you have posted.' : 'Jobs clients have chosen you for.'}
      tabBar
      role={role}
    >
      {loading && <p className="text-body text-muted">Loading…</p>}
      {error && <p className="text-body text-danger" role="alert">Couldn't load jobs: {error}</p>}

      {!loading && !error && jobs.length === 0 && (
        isClient
          ? <EmptyState text="You haven't posted any jobs yet. Describe what you need and workers nearby will send offers." action={<Button to="/post-job">Post a job</Button>} />
          : <EmptyState text="No clients have chosen you yet. Send offers on jobs near you to get hired." action={<Button to="/jobs">Find jobs</Button>} />
      )}

      {!loading && !error && jobs.length > 0 && (
        <>
          <div
            role="tablist"
            aria-label="Job status"
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
                    selected ? 'bg-brand text-white' : 'bg-surface border border-line text-ink'
                  }`}
                >
                  {g.label}
                  <span className={`min-w-6 h-6 px-1.5 rounded-full inline-flex items-center justify-center text-micro ${selected ? 'bg-white/20' : 'bg-soft text-muted'}`}>
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
                <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 items-start">
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
const CHIP_TONES = { action: 'action', wait: 'soft', done: 'mint', problem: 'problem' };

function JobCard({ job, role, onChange }) {
  const isClient = role === 'client';
  const chip = statusChip(job, role);
  const money = moneyLabel(job, role);
  const price = job.agreedPrice ?? job.proposedPrice;
  const who = isClient
    ? (job.worker ? job.worker.name : null)
    : job.client?.name;

  return (
    <Card as="li" className="p-5 flex flex-col gap-4">
      <div>
        <Badge tone={CHIP_TONES[chip.tone]}>{chip.label}</Badge>
        <h2 className="text-card text-ink mt-3 break-words">
          <Link to={`/my-jobs/${job._id}`} className="hover:underline">{job.description}</Link>
        </h2>
        <p className="text-body text-muted mt-1 break-words">
          {categoryLabel(job.category)} · {areaLabel(job.area)}{who ? ` · ${who}` : ''}
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <p className="text-small text-muted">{job.agreedPrice != null ? 'Agreed price' : 'Your price'}</p>
          <p className="text-section text-ink whitespace-nowrap">{formatRwf(price)}</p>
        </div>
        {money && (
          <p className="text-label text-heading inline-flex items-center gap-2">
            <span aria-hidden="true" className={`w-2 h-2 rounded-full ${job.escrow?.status === 'released' ? 'bg-signal' : job.escrow?.status === 'held' ? 'bg-accent' : 'bg-faint'}`} />
            <span className="sr-only">Money: </span>{money}
          </p>
        )}
      </div>

      <NextStep job={job} role={role} onChange={onChange} />
    </Card>
  );
}

// The one next step for this job, or a way into it when there is nothing to do.
function NextStep({ job, role, onChange }) {
  const to = `/my-jobs/${job._id}`;
  const released = job.escrow?.status === 'released';
  if (role === 'client' && job.status === 'open' && job.responseCount > 0) return <Button to={to}>See offers</Button>;
  if (job.status === 'completed' && released && !job.rated) {
    return <Button to={to}>{role === 'client' ? 'Send rating' : 'Rate the client'}</Button>;
  }
  if (job.escrow?.pending || hasPrimaryAction(job, role)) return <JobActions job={job} role={role} onChange={onChange} primaryOnly />;
  return <Button to={to} variant="outline">View job</Button>;
}

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
  const findWork = isClient ? <Button to="/post-job">Post a job</Button> : <Button to="/jobs">Find jobs</Button>;

  const content = {
    waiting: ['No jobs waiting for offers. Post a job and workers nearby can respond.', <Button to="/post-job">Post a job</Button>],
    active: isClient
      ? ['Nothing active right now. Choose an offer on a posted job to get started.', has('waiting') ? go('waiting', 'See jobs waiting for offers') : findWork]
      : ['No active work right now. Send offers on open jobs to get hired.', findWork],
    confirm: isClient
      ? ['Nothing to confirm. When a worker marks a job done, it shows up here.', has('active') ? go('active', 'See active jobs') : findWork]
      : ['Nothing waiting for the client. Jobs you mark complete show up here.', has('active') ? go('active', 'See active work') : findWork],
    completed: ['No completed jobs yet. Finished and paid jobs show up here.', has('active') ? go('active', isClient ? 'See active jobs' : 'See active work') : findWork],
    disputed: ['No problems reported. If something goes wrong on a job, report it from the job page.', go(has('active') ? 'active' : groups[0].key, 'Back to my jobs')]
  }[group];

  return <EmptyState text={content[0]} action={content[1]} />;
}
