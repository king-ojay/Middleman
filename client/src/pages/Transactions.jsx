import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { formatRwf } from '../format.js';
import { JOB_STATES, amountLabel, counterpartLabel, dateTimeLabel, groupTransactions, shortDate, stateLabel, stepsFor } from '../transactions.js';
import { Avatar, Badge, Button, Card, LoadingState, PageLayout, Skeleton, SkeletonText } from '../components/ui/index.js';
import LoadError from '../components/LoadError.jsx';
import { TestPaymentNotice } from '../components/JobActions.jsx';
import { t, tn } from '../i18n/index.js';

// Your own money movements (GET /api/transactions), reached from the
// earnings card on your profile: the total, three tiles (in escrow, released,
// refunded), then one card per job under month headings, newest first. The
// totals count only money that reached the worker; pending and failed
// attempts are shown but not counted.
export default function Transactions() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState('');

  const load = () =>
    api('/api/transactions')
      .then(next => { setData(next); setError(null); })
      .catch(setError);
  const tryAgain = () => {
    setRetrying(true);
    load().finally(() => setRetrying(false));
  };
  useEffect(() => { load(); }, [user]);

  const loadMore = async () => {
    setLoadingMore(true);
    setMoreError('');
    try {
      const next = await api(`/api/transactions?offset=${data.nextOffset}`);
      setData(d => ({ ...next, transactions: [...d.transactions, ...next.transactions] }));
    } catch (err) {
      setMoreError(err.message);
    } finally {
      setLoadingMore(false);
    }
  };

  const isWorker = user.role === 'worker';
  const months = data ? groupTransactions(data.transactions) : [];
  return (
    <PageLayout back title={t('tx.title')} tabBar role={user.role} width="medium">
      <p className="-mt-4 mb-6 flex items-center gap-2 text-body text-muted">
        <LockIcon />
        {t('tx.private')}
      </p>
      <TestPaymentNotice className="mb-6" />
      {!data && !error && <TransactionsSkeleton />}
      {error && <LoadError prefix={t('tx.loadError')} error={error} retrying={retrying} onRetry={tryAgain} />}

      {data && (
        <>
          <section aria-labelledby="total-label">
            <p id="total-label" className="text-body text-muted">{isWorker ? t('tx.earned') : t('tx.paid')}</p>
            <p className="text-amount-xl text-ink mt-1">{formatRwf(data.totals.total)}</p>
            <p className="text-small text-muted mt-1">{tn('tx.completedJobs', data.totals.jobs)}</p>
          </section>

          <div className="grid grid-cols-3 gap-2 mt-5">
            {TILES.map(tile => <Tile key={tile.key} {...tile} label={t(isWorker ? tile.worker : tile.client)} value={data.summary[tile.key]} />)}
          </div>

          {data.transactions.length === 0 ? (
            <Card className="p-6 mt-8 text-center flex flex-col items-center gap-4">
              <p className="text-body text-muted max-w-sm">
                {isWorker ? t('tx.empty.worker') : t('tx.empty.client')}
              </p>
              <div className="w-full max-w-xs">
                {isWorker ? <Button to="/jobs">{t('myJobs.findJobs')}</Button> : <Button to="/my-jobs">{t('tx.seeMyJobs')}</Button>}
              </div>
            </Card>
          ) : months.map(m => (
            <section key={m.month} className="mt-8">
              <h2 className="text-section text-ink mb-3">{m.month}</h2>
              <ul className="grid grid-cols-1 gap-3">
                {m.jobs.map(card => <JobMoney key={String(card.job._id)} card={card} role={user.role} />)}
              </ul>
            </section>
          ))}

          {data.nextOffset != null && (
            <div className="mt-4">
              <Button variant="secondary" onClick={loadMore} disabled={loadingMore} aria-busy={loadingMore}>
                {loadingMore ? t('common.loading') : t('tx.showMore')}
              </Button>
              {moreError && <p className="text-small text-danger mt-2" role="alert">{t('tx.moreError', { message: moreError })}</p>}
            </div>
          )}
        </>
      )}
    </PageLayout>
  );
}

const LockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

// The three tiles (server: transactions.routes.js summary). Released is the
// same figure as the total above.
const TILES = [
  { key: 'inEscrow', client: 'tx.tile.inEscrow', worker: 'tx.tile.inEscrow', fill: 'bg-soft text-ink' },
  { key: 'released', client: 'tx.tile.released', worker: 'tx.tile.received', fill: 'bg-trust text-on-trust' },
  { key: 'refunded', client: 'tx.tile.refunded', worker: 'tx.tile.refundedToClient', fill: 'bg-surface text-ink' }
];

function Tile({ label, value, fill }) {
  return (
    <div className={`rounded-tile p-3 min-w-0 ${fill}`}>
      <p className="text-small font-semibold">{label}</p>
      <p className="mt-2 text-card font-bold break-words">
        {value.total.toLocaleString('en-US')}<span className="text-micro"> RWF</span>
      </p>
      <p className="text-small">{tn('tx.tile.jobs', value.jobs)}</p>
    </div>
  );
}

const BAR = { green: 'bg-signal', ink: 'bg-ink', grey: 'bg-step' };

// One job: who with, the job, the date, the amount and where the money is,
// the three steps, and any failed attempts (struck through).
function JobMoney({ card, role }) {
  const state = JOB_STATES[card.state];
  const steps = stepsFor(card);
  const failedOnly = card.state === 'failed';
  return (
    <Card as="li" className="p-4">
      <div className="flex items-start gap-3">
        <Avatar name={card.other || ''} tier="new" anonymous={!card.other} size={44} />
        <div className="min-w-0 flex-1">
          <Link to={`/my-jobs/${card.job._id}`} className="block truncate text-card text-ink hover:underline">{card.job.description}</Link>
          <p className="text-small text-muted mt-0.5">
            {counterpartLabel(card.other, role)} · <time dateTime={card.at}>{shortDate(card.at)}</time>
          </p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <p className={`text-card font-bold whitespace-nowrap ${failedOnly ? 'text-muted line-through' : 'text-ink'}`}>
            <span className="sr-only">{t('tx.amount')}</span>{amountLabel(card.main)}
          </p>
          <Badge tone={state.tone}>{stateLabel(card.state, role, card.main.automatic)}</Badge>
        </div>
      </div>

      <ol className="grid grid-cols-3 gap-1.5 mt-4" aria-label={t('tx.where')}>
        {steps.steps.map((step, i) => (
          <li key={step} className="min-w-0">
            <span aria-hidden="true" className={`block h-1.5 rounded-full ${i < steps.done ? BAR[steps.bar] : 'bg-line'}`} />
            <span className={`block mt-1.5 text-micro ${i < steps.done ? 'text-ink' : 'text-muted'}`}>
              {step}<span className="sr-only">{i < steps.done ? t('tx.step.done') : t('tx.step.notYet')}</span>
            </span>
          </li>
        ))}
      </ol>

      {card.failed.map(f => (
        <p key={f.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mt-3 pt-3 border-t border-line text-small text-muted">
          <span>{t('tx.failedAttempt')} · <time dateTime={f.at}>{dateTimeLabel(f.at)}</time></span>
          <span className="flex items-center gap-2">
            <span className="line-through">{amountLabel(f)}</span>
            <Badge tone="problem">{t('tx.status.failed')}</Badge>
          </span>
        </p>
      ))}
    </Card>
  );
}

// The shape of the page: total, three tiles, a month heading and job cards.
function TransactionsSkeleton() {
  return (
    <LoadingState label={t('tx.loading')}>
      <SkeletonText on="canvas" className="w-44" />
      <Skeleton on="canvas" className="h-12 w-56 mt-1 rounded-full" />
      <SkeletonText size="small" on="canvas" className="w-28 mt-1" />
      <div className="grid grid-cols-3 gap-2 mt-5">
        {[0, 1, 2].map(i => <Skeleton key={i} on="canvas" className="h-[96px] rounded-tile" />)}
      </div>
      <SkeletonText size="section" on="canvas" className="w-36 mt-8 mb-3" />
      <ul className="grid gap-3">
        {[0, 1, 2].map(i => (
          <Card as="li" key={i} className="p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="w-11 h-11 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <SkeletonText size="card" className="w-3/4" />
                <SkeletonText size="small" className="w-1/2" />
              </div>
              <div className="w-24 flex flex-col items-end gap-1">
                <SkeletonText size="card" className="w-full" />
                <Skeleton className="w-20 h-[26px] rounded-full" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1.5 mt-4">
              {[0, 1, 2].map(j => <Skeleton key={j} className="h-1.5 rounded-full" />)}
            </div>
          </Card>
        ))}
      </ul>
    </LoadingState>
  );
}
