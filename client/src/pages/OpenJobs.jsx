import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { firstName } from '../greeting.js';
import { formatRwf, timeAgo } from '../format.js';
import { categoryLabel, areaLabel } from '../options.js';
import { Avatar, Button, Card, Chip, ChipRow, FormField, PageLayout, PriceInput, Sheet, Switch, TierBadge } from '../components/ui/index.js';

// Worker home: open jobs in the worker's area that match one of their skills.
// Each job shows how trusted its client is from this worker's point of view,
// and takes one response: accept the client's price, or counter (FR-05).
export default function OpenJobs() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadFeed = () =>
    api('/api/jobs/feed')
      .then(setJobs)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));

  useEffect(() => { loadFeed(); }, [user]);

  return (
    <PageLayout eyebrow={`Hello, ${firstName(user)}`} title="Jobs near you" tabBar role="worker">
      {/* Workers respond to jobs in their own area only, so this row shows that area. */}
      <ChipRow label="Area" className="mb-4">
        <Chip active>{areaLabel(user.area)}</Chip>
      </ChipRow>

      {loading && <p className="text-body text-muted">Loading…</p>}
      {error && <p className="text-body text-danger" role="alert">Couldn't load jobs: {error}</p>}
      {!loading && !error && jobs.length === 0 && (
        <p className="text-body text-muted">
          No open {(user.skills || []).map(categoryLabel).join(' or ').toLowerCase()} jobs in {areaLabel(user.area)} right now.
        </p>
      )}

      <ul className="space-y-3">
        {jobs.map(job => (
          <Card as="li" key={job._id} className="p-5">
            <h2 className="text-card text-ink">{job.description}</h2>
            <p className="text-body text-muted mt-1">
              {categoryLabel(job.category)} · {areaLabel(job.area)} · posted {timeAgo(job.createdAt)}
            </p>
            <div className="flex items-center gap-3 mt-4">
              <Avatar name={job.client?.name} tier={job.clientTrust} size={44} />
              <div className="min-w-0">
                <Link to={`/people/${job.client?._id}`} className="block text-body font-semibold text-ink hover:underline">{job.client?.name}</Link>
                <TierBadge tier={job.clientTrust} />
              </div>
            </div>
            <p className="text-small text-muted mt-4">Client's price</p>
            <p className="text-title text-ink">{formatRwf(job.proposedPrice)}</p>
            <ResponseControls job={job} onSent={loadFeed} />
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
      <p className="text-body text-forest bg-mint rounded-field px-4 py-3 mt-4">
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
