import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { formatRwf } from '../format.js';
import { categoryLabel } from '../options.js';
import { STATUS, TYPE_LABELS, amountLabel, dateTimeLabel, otherLabel } from '../transactions.js';
import { Badge, Button, Card, LoadingState, PageLayout, Skeleton, SkeletonText } from '../components/ui/index.js';
import LoadError from '../components/LoadError.jsx';

// Your own money movements (GET /api/transactions), newest first, reached
// from the earnings card on your profile. The totals count only money that
// reached the worker; pending and failed attempts are listed but not counted.
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
  return (
    <PageLayout back title="Transactions" subtitle="Money in and out of escrow on your jobs. Only you can see this." tabBar role={user.role} width="medium">
      {!data && !error && <TransactionsSkeleton />}
      {error && <LoadError prefix="Couldn't load transactions" error={error} retrying={retrying} onRetry={tryAgain} />}

      {data && (
        <>
          <Card className="p-5">
            <p className="text-body font-semibold text-ink">{isWorker ? 'Earned on Middleman' : 'Paid through Middleman'}</p>
            <p className="text-title text-heading mt-2">{formatRwf(data.totals.total)}</p>
            <p className="text-small text-muted mt-1">{data.totals.jobs} completed job{data.totals.jobs === 1 ? '' : 's'}</p>
          </Card>

          <h2 className="text-section text-ink mt-8 mb-3">All movements</h2>
          {data.transactions.length === 0 ? (
            <Card className="p-6 text-center flex flex-col items-center gap-4">
              <p className="text-body text-muted max-w-sm">
                {isWorker
                  ? 'No money yet. When a client confirms a job you did, the payment shows up here.'
                  : 'No money has moved yet. When you pay for a job into escrow, it shows up here.'}
              </p>
              <div className="w-full max-w-xs">
                {isWorker ? <Button to="/jobs">Find jobs</Button> : <Button to="/my-jobs">See my jobs</Button>}
              </div>
            </Card>
          ) : (
            <Card as="ul" className="p-0 px-5 divide-y divide-line">
              {data.transactions.map(row => <Row key={row.id} row={row} />)}
            </Card>
          )}

          {data.nextOffset != null && (
            <div className="mt-4">
              <Button variant="outline" onClick={loadMore} disabled={loadingMore} aria-busy={loadingMore}>
                {loadingMore ? 'Loading…' : 'Show more'}
              </Button>
              {moreError && <p className="text-small text-danger mt-2" role="alert">Couldn't load more: {moreError}</p>}
            </div>
          )}
        </>
      )}
    </PageLayout>
  );
}

// What happened, the job (a link to it), who with and when; the amount and
// its status on the right.
function Row({ row }) {
  const status = STATUS[row.status] || { label: row.status, tone: 'soft' };
  return (
    <li className="py-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-body font-semibold text-ink">{TYPE_LABELS[row.type]}</p>
        <Link to={`/my-jobs/${row.job._id}`} className="block truncate text-body text-heading hover:underline">{row.job.description}</Link>
        <p className="text-small text-muted mt-1">
          {categoryLabel(row.job.category)} · {otherLabel(row)} · <time dateTime={row.at} className="whitespace-nowrap">{dateTimeLabel(row.at)}</time>
        </p>
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1">
        <p className={`text-body font-semibold whitespace-nowrap ${row.status === 'failed' ? 'text-muted line-through' : 'text-ink'}`}>
          <span className="sr-only">Amount: </span>{amountLabel(row)}
        </p>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
    </li>
  );
}

// The shape of the page: the totals card, then rows of label, job, details
// on the left and amount over status on the right.
function TransactionsSkeleton() {
  return (
    <LoadingState label="Loading transactions">
      <Card className="p-5">
        <SkeletonText className="w-40" />
        <SkeletonText size="title" className="w-36 mt-2" />
        <SkeletonText size="small" className="w-28 mt-1" />
      </Card>
      <h2 className="text-section text-ink mt-8 mb-3">All movements</h2>
      <Card as="ul" className="p-0 px-5 divide-y divide-line">
        {[0, 1, 2, 3].map(i => (
          <li key={i} className="py-4 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <SkeletonText className="w-32" />
              <SkeletonText className="w-3/4" />
              <SkeletonText size="small" className="w-1/2 mt-1" />
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1">
              <SkeletonText className="w-24" />
              <Skeleton className="w-20 h-[26px] rounded-full" />
            </div>
          </li>
        ))}
      </Card>
    </LoadingState>
  );
}
