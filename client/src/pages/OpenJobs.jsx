// Worker home: browse and search open jobs, and accept or counter one.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { firstName } from '../greeting.js';
import { formatRwf, timeAgo } from '../format.js';
import { AREAS, categoryLabel, areaLabel } from '../options.js';
import {
  Avatar, Badge, Button, Card, Chip, ChipRow, FormField, LoadingState, PageLayout, PriceInput, Sheet, Skeleton, SkeletonText, Switch, TierBadge
} from '../components/ui/index.js';
import { t } from '../i18n/index.js';

const SORTS = ['newest', 'price_high', 'price_low'].map(value => ({ value, get label() { return t(`jobs.sort.${value}`); } }));
const DEFAULTS = { area: 'mine', trade: 'mine', sort: 'newest' };

// Worker home: open jobs to browse. By default the worker's own area and
// trades (as before); filters widen it to any pilot area or trade, search the
// descriptions, and sort by price. Each job shows how trusted its client is
// from this worker's point of view, and takes one response: accept the
// client's price, or counter (FR-05). Responses are limited to the worker's
// own trades, in any pilot area.
export default function OpenJobs() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(DEFAULTS);
  const [query, setQuery] = useState('');
  const [q, setQ] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [reload, setReload] = useState(0);
  // What to say when this worker holds the most active jobs allowed
  // (server/config/workload.js); null below the limit.
  const [atLimit, setAtLimit] = useState(null);

  useEffect(() => {
    // Only the latest filters may fill the list: a slow answer for filters
    // the worker has already changed is ignored.
    let current = true;
    const params = new URLSearchParams({ ...filters, ...(q && { q }) });
    setLoading(true);
    setError('');
    api(`/api/jobs/feed?${params}`)
      .then(data => current && setJobs(data))
      .catch(err => { if (current) { setJobs([]); setError(err.message); } })
      .finally(() => current && setLoading(false));
    return () => { current = false; };
  }, [user, filters, q, reload]);

  // The server refuses offers at the limit anyway; this only says so up front.
  useEffect(() => {
    let current = true;
    api('/api/jobs/workload')
      .then(w => current && setAtLimit(w.atLimit ? t('error.at_limit', { limit: w.limit }) : null))
      .catch(() => current && setAtLimit(null));
    return () => { current = false; };
  }, [user, reload]);

  const set = patch => setFilters(f => ({ ...f, ...patch }));
  const search = e => {
    e.preventDefault();
    setQ(query.trim());
  };
  const clearSearch = () => {
    setQuery('');
    setQ('');
  };

  const myTrades = (user.skills || []).map(categoryLabel).join(t('jobs.tradesJoin')).toLowerCase();
  const areaText = filters.area === 'mine' ? areaLabel(user.area) : filters.area === 'all' ? t('common.allAreas') : areaLabel(filters.area);
  const tradeText = filters.trade === 'mine' ? t('jobs.myTrades') : t('jobs.anyTrade');
  const sortText = SORTS.find(s => s.value === filters.sort).label;
  const isDefault = !q && Object.entries(DEFAULTS).every(([k, v]) => filters[k] === v);

  return (
    <PageLayout eyebrow={t('greeting.hello', { name: firstName(user) })} title={isDefault ? t('jobs.titleNear') : t('jobs.titleFind')} tabBar role="worker">
      {atLimit && <p role="status" className="text-body text-on-warn bg-warn rounded-field px-4 py-3 mb-4">{atLimit}</p>}
      <form onSubmit={search} role="search" className="relative mb-2">
        <label htmlFor="job-search" className="sr-only">{t('jobs.searchLabel')}</label>
        <input
          id="job-search"
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          maxLength={100}
          placeholder={t('jobs.searchPlaceholder')}
          className="w-full h-14 bg-surface border border-field rounded-full pl-5 pr-16 text-body text-ink placeholder:text-faint focus:outline-none"
        />
        <button type="submit" aria-label={t('common.search')} className="absolute right-1.5 top-1.5 w-11 h-11 rounded-full bg-primary text-on-primary flex items-center justify-center transition-colors hover:bg-primary-hover active:bg-primary-hover">
          <svg width="10" height="16" viewBox="0 0 10 16" fill="none" aria-hidden="true">
            <path d="m2 2 6 6-6 6" className="stroke-current" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>
      {q && (
        <p className="text-small text-muted mb-2" role="status">
          {t('jobs.matching', { q })}{' '}
          <button type="button" onClick={clearSearch} className="font-semibold text-ink underline">{t('jobs.clear')}</button>
        </p>
      )}

      <div className="flex items-center justify-between gap-3 mt-2">
        <p className="text-body text-muted min-w-0">{areaText} · {tradeText} · {sortText}</p>
        <button type="button" aria-expanded={showFilters} onClick={() => setShowFilters(v => !v)} className="h-11 px-1 shrink-0 text-body font-semibold text-ink hover:underline">
          {showFilters ? t('common.done') : t('jobs.filters')}
        </button>
      </div>
      {showFilters && (
        <div className="space-y-3 mb-2">
          <ChipRow label={t('common.area')}>
            <Chip active={filters.area === 'mine'} onClick={() => set({ area: 'mine' })}>{t('jobs.myArea', { area: areaLabel(user.area) })}</Chip>
            <Chip active={filters.area === 'all'} onClick={() => set({ area: 'all' })}>{t('common.allAreas')}</Chip>
            {AREAS.filter(a => a.value !== user.area).map(a => (
              <Chip key={a.value} active={filters.area === a.value} onClick={() => set({ area: a.value })}>{a.label}</Chip>
            ))}
          </ChipRow>
          <ChipRow label={t('common.trade')}>
            <Chip active={filters.trade === 'mine'} onClick={() => set({ trade: 'mine' })}>{t('jobs.myTrades')}</Chip>
            <Chip active={filters.trade === 'any'} onClick={() => set({ trade: 'any' })}>{t('jobs.anyTrade')}</Chip>
          </ChipRow>
          <ChipRow label={t('jobs.sort')}>
            {SORTS.map(s => (
              <Chip key={s.value} active={filters.sort === s.value} onClick={() => set({ sort: s.value })}>{s.label}</Chip>
            ))}
          </ChipRow>
          {!isDefault && (
            <button type="button" onClick={() => { setFilters(DEFAULTS); clearSearch(); }} className="h-11 px-1 text-body font-semibold text-ink hover:underline">
              {t('jobs.backNear')}
            </button>
          )}
        </div>
      )}

      <div className="mt-4">
        {loading && (
          <LoadingState label={t('jobs.loading')}>
            <ul className="grid gap-3 md:grid-cols-2">
              {[0, 1, 2].map(i => <JobCardSkeleton key={i} />)}
            </ul>
          </LoadingState>
        )}
        {error && <p className="text-body text-danger" role="alert">{t('common.loadError', { what: t('jobs.loadError'), message: error })}</p>}
        {!loading && !error && jobs.length === 0 && (
          <p className="text-body text-muted">
            {isDefault
              ? t('jobs.noneNear', { trades: myTrades, area: areaLabel(user.area) })
              : t('jobs.noneMatch')}
          </p>
        )}
      </div>

      <ul className="grid gap-3 md:grid-cols-2">
        {!loading && jobs.map(job => (
          <Card as="li" key={job._id} className="p-5 flex flex-col">
            {job.myResponse && <div className="mb-2"><Badge tone="ink">{t('jobs.responded')}</Badge></div>}
            <h2 className="text-card text-ink break-words">{job.description}</h2>
            <p className="text-body text-muted mt-1">
              {categoryLabel(job.category)} · {areaLabel(job.area)} · {t('jobs.posted', { when: timeAgo(job.createdAt) })}
            </p>
            <div className="flex items-center gap-3 mt-4">
              <Avatar name={job.client?.name} size={44} />
              <div className="min-w-0">
                <Link to={`/people/${job.client?._id}`} className="block text-body font-semibold text-ink hover:underline truncate">{job.client?.name}</Link>
                <TierBadge tier={job.clientTrust} />
              </div>
            </div>
            {/* mt-auto: in a row of cards, prices and actions line up at the bottom */}
            <div className="mt-auto">
              <p className="text-small text-muted mt-4">{t('jobs.clientPrice')}</p>
              <p className="text-amount text-ink">{formatRwf(job.proposedPrice)}</p>
              {job.canRespond || job.myResponse
                ? <ResponseControls job={job} atLimit={Boolean(atLimit)} onSent={() => setReload(n => n + 1)} />
                : <p className="text-body text-muted bg-soft rounded-field px-4 py-3 mt-4">{t('jobs.notYourTrade')}</p>}
            </div>
          </Card>
        ))}
      </ul>
    </PageLayout>
  );
}

// The shape of one open-job card above: description, trade · area, the
// client and their tier, the price and the two response buttons.
function JobCardSkeleton() {
  return (
    <Card as="li" className="p-5 flex flex-col">
      <SkeletonText size="card" className="w-3/4" />
      <SkeletonText className="w-1/2 mt-1" />
      <div className="flex items-center gap-3 mt-4">
        <Skeleton className="w-11 h-11 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <SkeletonText className="w-1/3" />
          <Skeleton className="w-40 h-[26px] rounded-full" />
        </div>
      </div>
      <SkeletonText size="small" className="w-24 mt-4" />
      <SkeletonText size="title" className="w-36" />
      <div className="flex gap-3 mt-4">
        <Skeleton className="flex-1 h-11 rounded-full" />
        <Skeleton className="flex-1 h-11 rounded-full" />
      </div>
    </Card>
  );
}

function ResponseControls({ job, atLimit, onSent }) {
  const [mode, setMode] = useState(null); // 'accept' | 'counter' | null
  const [price, setPrice] = useState(String(job.proposedPrice));
  const [needsMaterials, setNeedsMaterials] = useState(false);
  const [deposit, setDeposit] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  if (job.myResponse) {
    const r = job.myResponse;
    return (
      <p className="text-body text-ink bg-soft rounded-field px-4 py-3 mt-4">
        {t(r.isCounter ? 'jobs.youCountered' : 'jobs.youAccepted', { amount: formatRwf(r.amount) })}
        {r.depositAmount > 0 && t('jobs.needingMaterials', { amount: formatRwf(r.depositAmount) })}{t('jobs.waitingChoose')}
      </p>
    );
  }

  const open = next => {
    setMode(next);
    setPrice(String(job.proposedPrice));
    setNeedsMaterials(false);
    setDeposit('');
    setError('');
  };

  // One sheet for both responses (FR-05). Accepting keeps the client's price;
  // countering changes it. Either can ask for materials money upfront.
  const submit = async e => {
    e.preventDefault();
    const amount = mode === 'accept' ? job.proposedPrice : Number(price);
    const depositAmount = needsMaterials ? Number(deposit) : 0;
    if (!amount) return setError(t('jobs.err.price'));
    if (needsMaterials && !depositAmount) return setError(t('jobs.err.materials'));
    if (needsMaterials && depositAmount >= amount) return setError(t('jobs.err.materialsHigh'));
    setError('');
    setSending(true);
    try {
      await api(`/api/jobs/${job._id}/responses`, { method: 'POST', body: JSON.stringify({ amount, depositAmount }) });
      setMode(null);
      onSent();
    } catch (err) {
      setError(err.message);
      setSending(false);
    }
  };

  return (
    <div className="mt-4">
      <div className="flex gap-3">
        <Button size="md" className="flex-1" disabled={atLimit} onClick={() => open('accept')}>{t('jobs.accept')}</Button>
        <Button variant="outline" size="md" className="flex-1" disabled={atLimit} onClick={() => open('counter')}>{t('jobs.counter')}</Button>
      </div>

      <Sheet open={mode !== null} title={mode === 'accept' ? t('jobs.acceptTitle') : t('jobs.counterTitle')} onClose={() => setMode(null)}>
        <form onSubmit={submit} className="space-y-4">
          {mode === 'accept' ? (
            <div>
              <p className="text-small text-muted">{t('jobs.clientPrice')}</p>
              <p className="text-title text-ink">{formatRwf(job.proposedPrice)}</p>
            </div>
          ) : (
            <FormField helper={t('jobs.counterHelper', { amount: formatRwf(job.proposedPrice) })}>
              {field => <PriceInput {...field} aria-label={t('jobs.counterLabel')} value={price} onChange={setPrice} />}
            </FormField>
          )}

          <Card className="flex items-center justify-between gap-4">
            <span id={`materials-${job._id}`} className="text-body text-ink">{t('jobs.needsMaterials')}</span>
            <Switch checked={needsMaterials} onChange={setNeedsMaterials} aria-labelledby={`materials-${job._id}`} />
          </Card>
          {needsMaterials && (
            <FormField label={t('jobs.materialsAmount')} helper={t('jobs.materialsHelper')}>
              {field => <PriceInput {...field} value={deposit} onChange={setDeposit} placeholder="5,000" />}
            </FormField>
          )}

          {error && <p className="text-small text-danger" role="alert">{error}</p>}
          <Button type="submit" disabled={sending}>
            {sending ? t('common.sending') : mode === 'accept' ? t('jobs.acceptAmount', { amount: formatRwf(job.proposedPrice) }) : t('jobs.sendCounter')}
          </Button>
        </form>
      </Sheet>
    </div>
  );
}