// Worker home: browse and search open jobs, and accept or counter one.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { firstName } from '../greeting.js';
import { formatRwf, timeAgo } from '../format.js';
import { AREAS, categoryLabel, areaLabel } from '../options.js';
import { Avatar, Badge, Button, Card, Chip, ChipRow, FormField, PageLayout, PriceInput, Sheet, Switch, TierBadge } from '../components/ui/index.js';

const SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_high', label: 'Highest price' },
  { value: 'price_low', label: 'Lowest price' }
];
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

  const set = patch => setFilters(f => ({ ...f, ...patch }));
  const search = e => {
    e.preventDefault();
    setQ(query.trim());
  };
  const clearSearch = () => {
    setQuery('');
    setQ('');
  };

  const myTrades = (user.skills || []).map(categoryLabel).join(' or ').toLowerCase();
  const areaText = filters.area === 'mine' ? areaLabel(user.area) : filters.area === 'all' ? 'All areas' : areaLabel(filters.area);
  const tradeText = filters.trade === 'mine' ? 'My trades' : 'Any trade';
  const sortText = SORTS.find(s => s.value === filters.sort).label;
  const isDefault = !q && Object.entries(DEFAULTS).every(([k, v]) => filters[k] === v);

  return (
    <PageLayout eyebrow={`Hello, ${firstName(user)}`} title={isDefault ? 'Jobs near you' : 'Find jobs'} tabBar role="worker">
      <form onSubmit={search} role="search" className="relative mb-2">
        <label htmlFor="job-search" className="sr-only">Search jobs</label>
        <input
          id="job-search"
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          maxLength={100}
          placeholder="Search jobs, e.g. tap"
          className="w-full h-14 bg-surface rounded-full shadow-card pl-5 pr-16 text-body text-ink placeholder:text-faint focus:outline-none"
        />
        <button type="submit" aria-label="Search" className="absolute right-1.5 top-1.5 w-11 h-11 rounded-full bg-accent text-on-accent flex items-center justify-center">
          <svg width="10" height="16" viewBox="0 0 10 16" fill="none" aria-hidden="true">
            <path d="m2 2 6 6-6 6" className="stroke-current" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>
      {q && (
        <p className="text-small text-muted mb-2" role="status">
          Showing jobs matching “{q}”.{' '}
          <button type="button" onClick={clearSearch} className="font-semibold text-heading underline">Clear</button>
        </p>
      )}

      <div className="flex items-center justify-between gap-3 mt-2">
        <p className="text-body text-muted min-w-0">{areaText} · {tradeText} · {sortText}</p>
        <button type="button" aria-expanded={showFilters} onClick={() => setShowFilters(v => !v)} className="h-11 px-1 shrink-0 text-body font-semibold text-heading">
          {showFilters ? 'Done' : 'Filters'}
        </button>
      </div>
      {showFilters && (
        <div className="space-y-3 mb-2">
          <ChipRow label="Area">
            <Chip active={filters.area === 'mine'} onClick={() => set({ area: 'mine' })}>My area · {areaLabel(user.area)}</Chip>
            <Chip active={filters.area === 'all'} onClick={() => set({ area: 'all' })}>All areas</Chip>
            {AREAS.filter(a => a.value !== user.area).map(a => (
              <Chip key={a.value} active={filters.area === a.value} onClick={() => set({ area: a.value })}>{a.label}</Chip>
            ))}
          </ChipRow>
          <ChipRow label="Trade">
            <Chip active={filters.trade === 'mine'} onClick={() => set({ trade: 'mine' })}>My trades</Chip>
            <Chip active={filters.trade === 'any'} onClick={() => set({ trade: 'any' })}>Any trade</Chip>
          </ChipRow>
          <ChipRow label="Sort">
            {SORTS.map(s => (
              <Chip key={s.value} active={filters.sort === s.value} onClick={() => set({ sort: s.value })}>{s.label}</Chip>
            ))}
          </ChipRow>
          {!isDefault && (
            <button type="button" onClick={() => { setFilters(DEFAULTS); clearSearch(); }} className="h-11 px-1 text-body font-semibold text-heading">
              Back to jobs near you
            </button>
          )}
        </div>
      )}

      <div className="mt-4">
        {loading && <p className="text-body text-muted">Loading…</p>}
        {error && <p className="text-body text-danger" role="alert">Couldn't load jobs: {error}</p>}
        {!loading && !error && jobs.length === 0 && (
          <p className="text-body text-muted">
            {isDefault
              ? `No open ${myTrades} jobs in ${areaLabel(user.area)} right now. Try Filters to look in other areas.`
              : 'No open jobs match. Try another area, trade or search.'}
          </p>
        )}
      </div>

      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 items-start">
        {!loading && jobs.map(job => (
          <Card as="li" key={job._id} className="p-5">
            {job.myResponse && <div className="mb-2"><Badge tone="mint">You responded</Badge></div>}
            <h2 className="text-card text-ink break-words">{job.description}</h2>
            <p className="text-body text-muted mt-1">
              {categoryLabel(job.category)} · {areaLabel(job.area)} · posted {timeAgo(job.createdAt)}
            </p>
            <div className="flex items-center gap-3 mt-4">
              <Avatar name={job.client?.name} tier={job.clientTrust} size={44} />
              <div className="min-w-0">
                <Link to={`/people/${job.client?._id}`} className="block text-body font-semibold text-ink hover:underline truncate">{job.client?.name}</Link>
                <TierBadge tier={job.clientTrust} />
              </div>
            </div>
            <p className="text-small text-muted mt-4">Client's price</p>
            <p className="text-title text-ink">{formatRwf(job.proposedPrice)}</p>
            {job.canRespond || job.myResponse
              ? <ResponseControls job={job} onSent={() => setReload(n => n + 1)} />
              : <p className="text-body text-muted bg-soft rounded-field px-4 py-3 mt-4">Not one of your trades – view only.</p>}
          </Card>
        ))}
      </ul>
    </PageLayout>
  );
}

function ResponseControls({ job, onSent }) {
  const [mode, setMode] = useState(null); // 'accept' | 'counter' | null
  const [price, setPrice] = useState(String(job.proposedPrice));
  const [needsMaterials, setNeedsMaterials] = useState(false);
  const [deposit, setDeposit] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  if (job.myResponse) {
    const r = job.myResponse;
    return (
      <p className="text-body text-heading bg-mint rounded-field px-4 py-3 mt-4">
        {r.isCounter ? `You countered at ${formatRwf(r.amount)}` : `You accepted ${formatRwf(r.amount)}`}
        {r.depositAmount > 0 && `, needing ${formatRwf(r.depositAmount)} upfront for materials`}. Waiting for the client to choose.
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
    if (!amount) return setError('Enter your price.');
    if (needsMaterials && !depositAmount) return setError('Enter how much you need upfront for materials.');
    if (needsMaterials && depositAmount >= amount) return setError('The materials amount must be less than the price.');
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
        <Button size="md" className="flex-1" onClick={() => open('accept')}>Accept</Button>
        <Button variant="outline" size="md" className="flex-1" onClick={() => open('counter')}>Counter</Button>
      </div>

      <Sheet open={mode !== null} title={mode === 'accept' ? 'Accept this price' : 'Your price'} onClose={() => setMode(null)}>
        <form onSubmit={submit} className="space-y-4">
          {mode === 'accept' ? (
            <div>
              <p className="text-small text-muted">Client's price</p>
              <p className="text-title text-ink">{formatRwf(job.proposedPrice)}</p>
            </div>
          ) : (
            <FormField helper={`The client offered ${formatRwf(job.proposedPrice)}. You can send one counter-offer.`}>
              {field => <PriceInput {...field} aria-label="Your price in RWF" value={price} onChange={setPrice} />}
            </FormField>
          )}

          <Card className="flex items-center justify-between gap-4">
            <span id={`materials-${job._id}`} className="text-body text-ink">Needs materials upfront?</span>
            <Switch checked={needsMaterials} onChange={setNeedsMaterials} aria-labelledby={`materials-${job._id}`} />
          </Card>
          {needsMaterials && (
            <FormField label="Amount for materials" helper="Must be less than the price.">
              {field => <PriceInput {...field} value={deposit} onChange={setDeposit} placeholder="5,000" />}
            </FormField>
          )}

          {error && <p className="text-small text-danger" role="alert">{error}</p>}
          <Button type="submit" disabled={sending}>
            {sending ? 'Sending…' : mode === 'accept' ? `Accept ${formatRwf(job.proposedPrice)}` : 'Send counter-offer'}
          </Button>
        </form>
      </Sheet>
    </div>
  );
}