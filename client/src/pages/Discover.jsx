import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { greeting } from '../greeting.js';
import { CATEGORIES, AREAS, categoryLabel, areaLabel } from '../options.js';
import { Avatar, Card, Chip, ChipRow, PageLayout, TierBadge } from '../components/ui/index.js';

export default function Discover() {
  const { user } = useAuth();
  const [category, setCategory] = useState('electrician');
  const [area, setArea] = useState('');
  const [changingArea, setChangingArea] = useState(false);
  const [query, setQuery] = useState('');
  const [searchHint, setSearchHint] = useState('');
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams({ category, ...(area && { area }) });
    setLoading(true);
    setError('');
    api(`/api/discover?${params}`)
      .then(setWorkers)
      .catch(err => { setWorkers([]); setError(err.message); })
      .finally(() => setLoading(false));
  }, [user, category, area]);

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
          className="w-full h-14 bg-white rounded-full shadow-card pl-5 pr-16 text-body text-ink placeholder:text-faint focus:outline-none"
        />
        <button type="submit" aria-label="Search" className="absolute right-1.5 top-1.5 w-11 h-11 rounded-full bg-signal text-on-signal flex items-center justify-center">
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
        <button type="button" onClick={() => setChangingArea(v => !v)} className="h-11 px-1 text-body font-semibold text-forest">
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

      <h2 className="text-section text-ink mt-6">Ranked by your network</h2>
      <p className="text-body text-muted mb-4">People you trust, and the people they trust, come first.</p>

      {error && <p className="text-body text-danger" role="alert">Couldn't load workers: {error}</p>}
      {loading && <p className="text-body text-muted">Loading…</p>}
      {!loading && !error && workers.length === 0 && (
        <p className="text-body text-muted">No {categoryLabel(category).toLowerCase()} workers{area ? ` in ${areaLabel(area)}` : ''} yet.</p>
      )}

      <ul className="space-y-3">
        {!loading && workers.map(w => (
          <Card as="li" key={w._id} className="p-0">
            <Link to={`/people/${w._id}`} className="flex items-center gap-4 p-4 rounded-card">
              <Avatar name={w.name} tier={w.trustSource} size={52} />
              <div className="min-w-0 flex-1">
                <h3 className="text-card text-ink">{w.name}</h3>
                <p className="text-body text-muted">{(w.skills || []).map(categoryLabel).join(', ')} · {areaLabel(w.area)}</p>
                <div className="mt-2"><TierBadge tier={w.trustSource} /></div>
              </div>
              <svg width="8" height="14" viewBox="0 0 8 14" fill="none" aria-hidden="true" className="shrink-0">
                <path d="m1.5 1.5 5 5.5-5 5.5" className="stroke-faint" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </Card>
        ))}
      </ul>
    </PageLayout>
  );
}
