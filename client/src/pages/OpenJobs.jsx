import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { firstName } from '../greeting.js';
import { formatRwf, timeAgo } from '../format.js';
import { categoryLabel, areaLabel } from '../options.js';
import { Avatar, Button, Card, Chip, ChipRow, FormField, PageLayout, PriceInput, TierBadge } from '../components/ui/index.js';

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
                <p className="text-body font-semibold text-ink">{job.client?.name}</p>
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
  const [countering, setCountering] = useState(false);
  const [price, setPrice] = useState(String(job.proposedPrice));
  const [deposit, setDeposit] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  if (job.myResponse) {
    const r = job.myResponse;
    return (
      <p className="text-body text-forest bg-mint rounded-field px-4 py-3 mt-4">
        {r.isCounter ? `You countered at ${formatRwf(r.amount)}` : `You accepted ${formatRwf(r.amount)}`}
        {r.depositAmount > 0 && `, with ${formatRwf(r.depositAmount)} for materials first`}. Waiting for the client to choose.
      </p>
    );
  }

  const send = async body => {
    setError('');
    setSending(true);
    try {
      await api(`/api/jobs/${job._id}/responses`, { method: 'POST', body: JSON.stringify(body) });
      onSent();
    } catch (err) {
      setError(err.message);
      setSending(false);
    }
  };

  const sendCounter = e => {
    e.preventDefault();
    send({ amount: Number(price), depositAmount: Number(deposit) || 0 });
  };

  if (countering) {
    return (
      <form onSubmit={sendCounter} className="space-y-4 mt-4">
        <FormField label="Your price">
          {field => <PriceInput {...field} value={price} onChange={setPrice} />}
        </FormField>
        <FormField label="Materials deposit (optional)" helper="Only if you need money for materials before starting.">
          {field => <PriceInput {...field} value={deposit} onChange={setDeposit} placeholder="0" />}
        </FormField>
        {error && <p className="text-small text-danger" role="alert">{error}</p>}
        <div className="flex gap-3">
          <Button type="submit" size="md" className="flex-1" disabled={sending || !price}>{sending ? 'Sending…' : 'Send counter'}</Button>
          <Button variant="outline" size="md" className="flex-1" onClick={() => setCountering(false)}>Cancel</Button>
        </div>
      </form>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex gap-3">
        <Button size="md" className="flex-1" disabled={sending} onClick={() => send({})}>Accept</Button>
        <Button variant="outline" size="md" className="flex-1" onClick={() => setCountering(true)}>Counter</Button>
      </div>
      {error && <p className="text-small text-danger mt-2" role="alert">{error}</p>}
    </div>
  );
}
