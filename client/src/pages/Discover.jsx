import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { greeting } from '../greeting.js';
import { CATEGORIES, AREAS, categoryLabel, areaLabel } from '../options.js';
import LoadError from '../components/LoadError.jsx';
import ReasonTiles from '../components/ReasonTiles.jsx';
import TrustPath from '../components/TrustPath.jsx';
import ProfileButton from '../components/ProfileButton.jsx';
import { Avatar, Badge, Card, Chip, ChipRow, LoadingState, PageLayout, Sheet, Skeleton, SkeletonText, VerifiedBadge } from '../components/ui/index.js';
import { reasonSentence, topLabel } from '../trustReason.js';
import { t } from '../i18n/index.js';

export default function Discover() {
  const { user } = useAuth();
  const [category, setCategory] = useState('electrician');
  // Starts on the person's own area (chosen at signup or in Profile); "All areas" is one tap away.
  const [area, setArea] = useState(user.area || '');
  const [changingArea, setChangingArea] = useState(false);
  const [query, setQuery] = useState('');
  const [searchHint, setSearchHint] = useState('');
  const [workers, setWorkers] = useState([]);
  const [explaining, setExplaining] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // "Try again" re-runs the same request; the error stays up while it runs.
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const tryAgain = () => { setRetrying(true); setAttempt(n => n + 1); };

  useEffect(() => {
    // Only the latest trade/area may fill the list: a slow answer for a trade
    // the user has already switched away from is ignored.
    let current = true;
    const params = new URLSearchParams({ category, ...(area && { area }) });
    setLoading(true);
    if (!retrying) setError(null);
    api(`/api/discover?${params}`)
      .then(data => { if (current) { setWorkers(data); setError(null); } })
      .catch(err => { if (current) { setWorkers([]); setError(err); } })
      .finally(() => { if (current) { setLoading(false); setRetrying(false); } });
    return () => { current = false; };
  }, [user, category, area, attempt]);

  // Matches the typed text against trade names only. Free-text job
  // descriptions ("leaking tap") are Phase 6.
  const search = e => {
    e.preventDefault();
    const q = query.trim().toLowerCase();
    const match = CATEGORIES.find(c => c.label.toLowerCase().includes(q) || c.value.includes(q));
    if (q && match) {
      setCategory(match.value);
      setSearchHint('');
    } else {
      setSearchHint(t('discover.pickTrade'));
    }
  };

  const top = workers[0] && topLabel(workers[0].reason) ? workers[0] : null;
  const rest = top ? workers.slice(1) : workers;

  return (
    <PageLayout tabBar role="client">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          aria-expanded={changingArea}
          onClick={() => setChangingArea(v => !v)}
          className="h-11 px-4 inline-flex items-center gap-2 rounded-full bg-surface text-label text-ink transition-colors hover:bg-soft"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" />
          </svg>
          <span><span className="sr-only">{t('discover.areaLabel')}</span>{area ? areaLabel(area) : t('common.allAreas')}</span>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className={changingArea ? 'rotate-180' : ''}>
            <path d="m2.5 4.5 3.5 3.5 3.5-3.5" className="stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          aria-label={t('discover.howRanking')}
          onClick={() => setExplaining(true)}
          className="w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-full bg-surface text-ink transition-colors hover:bg-soft"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.5v.01" />
          </svg>
        </button>
      </div>
      {changingArea && (
        <ChipRow label={t('common.area')} className="mt-3">
          <Chip active={!area} onClick={() => setArea('')}>{t('common.allAreas')}</Chip>
          {AREAS.map(a => (
            <Chip key={a.value} active={a.value === area} onClick={() => setArea(a.value)}>{a.label}</Chip>
          ))}
        </ChipRow>
      )}

      <header className="mt-6 mb-5">
        <p className="text-body text-muted mb-1">{greeting(user)}</p>
        <h1 className="text-display text-ink">{t('discover.title')}</h1>
      </header>

      <form onSubmit={search} role="search" className="relative mb-2">
        <label htmlFor="trade-search" className="sr-only">{t('discover.searchLabel')}</label>
        <input
          id="trade-search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t('discover.searchPlaceholder')}
          className="w-full h-14 bg-surface border border-field rounded-full pl-5 pr-16 text-body text-ink placeholder:text-faint focus:border-primary focus:outline-none"
        />
        <button type="submit" aria-label={t('common.search')} className="absolute right-1.5 top-1.5 w-11 h-11 rounded-full bg-primary text-on-primary flex items-center justify-center transition-colors hover:bg-primary-hover active:bg-primary-hover">
          <svg width="10" height="16" viewBox="0 0 10 16" fill="none" aria-hidden="true">
            <path d="m2 2 6 6-6 6" className="stroke-current" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>
      {searchHint && <p className="text-small text-muted mb-2" role="status">{searchHint}</p>}

      <ChipRow label={t('common.trade')} className="mt-4">
        {CATEGORIES.map(c => (
          <Chip key={c.value} active={c.value === category} onClick={() => setCategory(c.value)}>{c.label}</Chip>
        ))}
      </ChipRow>

      <div className="mt-6">
        {error && <LoadError prefix={t('discover.loadError')} error={error} retrying={retrying} onRetry={tryAgain} />}
        {loading && !retrying && (
          <LoadingState label={t('discover.loading')}>
            <TopWorkerSkeleton />
            <SkeletonText size="section" on="canvas" className="w-56 mt-8 mb-3" />
            <ul className="grid gap-3">
              {[0, 1, 2].map(i => <WorkerCardSkeleton key={i} />)}
            </ul>
          </LoadingState>
        )}
        {!loading && !error && workers.length === 0 && (
          <p className="text-body text-muted">{t(area ? 'discover.noneIn' : 'discover.none', { trade: categoryLabel(category).toLowerCase(), area: areaLabel(area) })}</p>
        )}

        {/* One ranked column in the server's order: the first-ranked worker
            (network or area trust only) on the large card, the rest split
            where the tier changes. */}
        {!loading && (
          <div className="space-y-8">
            {top && (
              <ul aria-label={topLabel(top.reason)}>
                <TopWorkerCard worker={top} label={topLabel(top.reason)} />
              </ul>
            )}
            {TIERS.map(tier => {
              const inTier = rest.filter(w => w.reason?.tier === tier.key);
              if (inTier.length === 0) return null;
              return (
                <section key={tier.key} aria-labelledby={`tier-${tier.key}`}>
                  <h2 id={`tier-${tier.key}`} className="text-section text-ink mb-3">{tier.heading(area)}</h2>
                  <ul className="grid gap-3">
                    {inTier.map(w => <WorkerCard key={w._id} worker={w} />)}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>

      <Sheet open={explaining} title={t('discover.howRanking')} onClose={() => setExplaining(false)}>
        <ul className="space-y-3 text-body text-ink">
          <li>{t('discover.explain.1')}</li>
          <li>{t('discover.explain.2')}</li>
          <li>{t('discover.explain.3')}</li>
        </ul>
      </Sheet>
    </PageLayout>
  );
}

// The three tiers in ranking order, with their section headings. Area trust
// comes from raters in the worker's own area: with an area chosen, every
// worker is in it, so the heading can name it.
const TIERS = [
  { key: 'network', heading: () => t('discover.tier.network') },
  { key: 'area', heading: area => (area ? t('discover.tier.areaNamed', { area: areaLabel(area) }) : t('discover.tier.area')) },
  { key: 'new', heading: () => t('discover.tier.new') }
];

const trades = w => (w.skills || []).map(categoryLabel).join(', ');

// The first-ranked worker when trusted through the network or the area: the
// label chip, Verified, who they are, the fact tiles, the path and sentence,
// and "View profile". Phones stack it; from 1024px the person, the tiles and
// the button sit in one row, with the path and sentence underneath. Every
// tile and avatar comes from the same reason as the sentence.
function TopWorkerCard({ worker: w, label }) {
  return (
    <Card as="li" className="p-5 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center lg:gap-x-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="trust">{label}</Badge>
          {w.verified && <VerifiedBadge />}
        </div>
        <div className="flex items-center gap-3 mt-4">
          <Avatar name={w.name} tier={w.trustSource} size={52} />
          <div className="min-w-0">
            <h2 className="text-section text-ink">{w.name}</h2>
            <p className="text-body text-muted">{trades(w)} · {areaLabel(w.area)}</p>
          </div>
        </div>
      </div>
      <ReasonTiles reason={w.reason} className="mt-4 lg:mt-0 lg:w-[300px]" />
      <ProfileButton worker={w} variant="primary" size="lg" className="mt-4 lg:mt-0 lg:w-auto" />
      <div className="flex items-center gap-3 mt-4 lg:col-span-3">
        <TrustPath reason={w.reason} />
        <p className="text-body text-ink">{reasonSentence(w.reason)}</p>
      </div>
    </Card>
  );
}

// Everyone else: avatar, name, area (and Verified), the sentence saying why
// they are here, and a "View" pill. The avatar colour follows the tier.
function WorkerCard({ worker: w }) {
  return (
    <Card as="li" className="p-4 flex items-start gap-3">
      <Avatar name={w.name} tier={w.trustSource} size={44} />
      <div className="min-w-0 flex-1">
        <h3 className="text-card text-ink">{w.name}</h3>
        <p className="text-small text-muted flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{trades(w)} · {areaLabel(w.area)}</span>
          {w.verified && <VerifiedBadge />}
        </p>
        <p className="text-body text-ink mt-1">{reasonSentence(w.reason)}</p>
      </div>
      <ProfileButton worker={w} label={t('profileButton.short')} short className="shrink-0" />
    </Card>
  );
}

// The shape of TopWorkerCard: chip, avatar and name, three tiles, the button.
function TopWorkerSkeleton() {
  return (
    <Card className="p-5">
      <Skeleton className="w-44 h-[26px] rounded-full" />
      <div className="flex items-center gap-3 mt-4">
        <Skeleton className="w-[52px] h-[52px] shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <SkeletonText size="section" className="w-1/2" />
          <SkeletonText className="w-1/3" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-4">
        {[0, 1, 2].map(i => <Skeleton key={i} className="h-[66px] rounded-tile" />)}
      </div>
      <SkeletonText className="w-full mt-4" />
      <Skeleton className="h-14 w-full mt-4 rounded-full" />
    </Card>
  );
}

// The shape of WorkerCard: avatar, name, trades · area, the sentence, the pill.
function WorkerCardSkeleton() {
  return (
    <Card as="li" className="p-4 flex items-start gap-3">
      <Skeleton className="w-11 h-11 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1">
        <SkeletonText size="card" className="w-1/2" />
        <SkeletonText size="small" className="w-1/3" />
        <SkeletonText className="w-full mt-1" />
      </div>
      <Skeleton className="h-11 w-20 shrink-0 rounded-full" />
    </Card>
  );
}
