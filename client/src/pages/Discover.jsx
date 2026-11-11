import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { greeting } from '../greeting.js';
import { CATEGORIES, AREAS, categoryLabel, areaLabel } from '../options.js';
import LoadError from '../components/LoadError.jsx';
import RankedItem from '../components/RankedItem.jsx';
import { Avatar, Card, Chip, ChipRow, LoadingState, PageLayout, Sheet, Skeleton, SkeletonText, VerifiedBadge } from '../components/ui/index.js';
import { reasonSentence, topLabel } from '../trustReason.js';

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
      setSearchHint('Pick a trade below.');
    }
  };

  return (
    <PageLayout eyebrow={greeting(user)} title="Who do you need today?" tabBar role="client">
      <form onSubmit={search} role="search" className="relative mb-2">
        <label htmlFor="trade-search" className="sr-only">Search for a trade</label>
        <input
          id="trade-search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="e.g. electrician, plumber"
          className="w-full h-14 bg-surface rounded-full shadow-card pl-5 pr-16 text-body text-ink placeholder:text-faint focus:outline-none"
        />
        <button type="submit" aria-label="Search" className="absolute right-1.5 top-1.5 w-11 h-11 rounded-full bg-accent text-on-accent flex items-center justify-center transition-[filter] hover:brightness-95 active:brightness-90">
          <svg width="10" height="16" viewBox="0 0 10 16" fill="none" aria-hidden="true">
            <path d="m2 2 6 6-6 6" className="stroke-current" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>
      {searchHint && <p className="text-small text-muted mb-2" role="status">{searchHint}</p>}

      <ChipRow label="Trade" className="mt-4">
        {CATEGORIES.map(c => (
          <Chip key={c.value} active={c.value === category} onClick={() => setCategory(c.value)}>{c.label}</Chip>
        ))}
      </ChipRow>

      <div className="flex items-center justify-between mt-4">
        <p className="text-body text-muted">Area · {area ? areaLabel(area) : 'All areas'}</p>
        <button type="button" onClick={() => setChangingArea(v => !v)} className="h-11 px-1 text-body font-semibold text-heading hover:underline">
          {changingArea ? 'Done' : 'Change'}
        </button>
      </div>
      {changingArea && (
        <ChipRow label="Area" className="mb-2">
          <Chip active={!area} onClick={() => setArea('')}>All areas</Chip>
          {AREAS.map(a => (
            <Chip key={a.value} active={a.value === area} onClick={() => setArea(a.value)}>{a.label}</Chip>
          ))}
        </ChipRow>
      )}

      <div className="max-w-3xl flex items-center justify-between gap-3 mt-6">
        <h2 className="text-section text-ink">Ranked by your network</h2>
        <button type="button" onClick={() => setExplaining(true)} className="h-11 px-1 shrink-0 text-label font-semibold text-heading underline hover:no-underline">
          How ranking works
        </button>
      </div>
      <p className="text-body text-muted mb-4">People you trust, and the people they trust, come first.</p>

      {error && <LoadError prefix="Couldn't load workers" error={error} retrying={retrying} onRetry={tryAgain} />}
      {loading && !retrying && (
        <LoadingState label="Loading workers">
          <div className="max-w-3xl">
            <SkeletonText size="section" on="canvas" className="w-56 mb-3" />
            <ul className="grid gap-3">
              {[0, 1, 2, 3].map(i => <WorkerCardSkeleton key={i} />)}
            </ul>
          </div>
        </LoadingState>
      )}
      {!loading && !error && workers.length === 0 && (
        <p className="text-body text-muted">No {categoryLabel(category).toLowerCase()} workers{area ? ` in ${areaLabel(area)}` : ''} yet.</p>
      )}

      {/* One ranked column in the server's order, split where the tier changes. */}
      {!loading && (
        <div className="max-w-3xl space-y-8">
          {TIERS.map(tier => {
            const inTier = workers.filter(w => w.reason?.tier === tier.key);
            if (inTier.length === 0) return null;
            return (
              <section key={tier.key} aria-labelledby={`tier-${tier.key}`}>
                <h3 id={`tier-${tier.key}`} className="text-section text-ink mb-3">{tier.heading(area)}</h3>
                <ul className="grid gap-3">
                  {inTier.map(w => <WorkerCard key={w._id} worker={w} label={w === workers[0] ? topLabel(w.reason) : null} />)}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <Sheet open={explaining} title="How ranking works" onClose={() => setExplaining(false)}>
        <ul className="space-y-3 text-body text-ink">
          <li>People your network trusts come first: workers you rated well or invited, and workers rated well by people you know.</li>
          <li>Next come workers rated well by people who live in the same area as them.</li>
          <li>Everyone else is new on Middleman, with workers verified by Middleman first.</li>
        </ul>
      </Sheet>
    </PageLayout>
  );
}

// The three tiers in ranking order, with their section headings. Area trust
// comes from raters in the worker's own area: with an area chosen, every
// worker is in it, so the heading can name it.
const TIERS = [
  { key: 'network', heading: () => 'People your network trusts' },
  { key: 'area', heading: area => (area ? `Trusted in ${areaLabel(area)}` : 'Trusted in their area') },
  { key: 'new', heading: () => 'New on Middleman' }
];

// One worker: name, trades · area, the sentence saying why they are here, and
// the Verified badge. The first-ranked worker gets the emphasised card and a
// label. The avatar colour still follows the tier.
function WorkerCard({ worker: w, label }) {
  return (
    <RankedItem highlighted={Boolean(label)} className="p-0">
      <Link to={`/people/${w._id}`} className={`h-full flex items-center gap-4 p-4 rounded-card transition-colors ${label ? 'hover:brightness-95' : 'hover:bg-soft/60'}`}>
        <Avatar name={w.name} tier={w.trustSource} size={52} />
        <div className="min-w-0 flex-1">
          {label && <p className="text-label font-semibold text-heading mb-1">{label}</p>}
          <h4 className="text-card text-ink">{w.name}</h4>
          <p className="text-body text-muted">{(w.skills || []).map(categoryLabel).join(', ')} · {areaLabel(w.area)}</p>
          <p className="text-body text-ink mt-1">{reasonSentence(w.reason)}</p>
          {w.verified && <div className="mt-2"><VerifiedBadge /></div>}
        </div>
        <svg width="8" height="14" viewBox="0 0 8 14" fill="none" aria-hidden="true" className="shrink-0">
          <path d="m1.5 1.5 5 5.5-5 5.5" className="stroke-faint" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
    </RankedItem>
  );
}

// The shape of WorkerCard: avatar, name, trades · area, the reason sentence.
function WorkerCardSkeleton() {
  return (
    <Card as="li" className="p-0">
      <div className="flex items-center gap-4 p-4">
        <Skeleton className="w-[52px] h-[52px] shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <SkeletonText size="card" className="w-1/2" />
          <SkeletonText className="w-1/3" />
          <SkeletonText className="w-full mt-1" />
          <SkeletonText className="w-2/3" />
        </div>
      </div>
    </Card>
  );
}
