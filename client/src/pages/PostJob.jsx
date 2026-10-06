import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { formatRwf } from '../format.js';
import { CATEGORIES, AREAS, categoryLabel, areaLabel } from '../options.js';
import { Button, Chip, ChipRow, FormField, PageLayout, PriceInput, TextArea } from '../components/ui/index.js';

export default function PostJob() {
  const { user } = useAuth();
  const [category, setCategory] = useState('electrician');
  const [description, setDescription] = useState('');
  const [area, setArea] = useState(user.area);
  const [proposedPrice, setProposedPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [posted, setPosted] = useState(null);

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    if (!proposedPrice) return setError('Enter the price you want to pay.');
    setPosted(null);
    setSubmitting(true);
    try {
      const job = await api('/api/jobs', {
        method: 'POST',
        body: JSON.stringify({ category, description, area, proposedPrice: Number(proposedPrice) })
      });
      setPosted(job);
      setDescription('');
      setProposedPrice('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageLayout back title="Post a job" subtitle="Takes under a minute." tabBar role="client">
      {posted && (
        <div role="status" className="bg-mint rounded-card p-4 mb-6">
          <p className="text-card text-forest">Job posted</p>
          <p className="text-body text-ink mt-1">
            “{posted.description}” · {categoryLabel(posted.category)} · {areaLabel(posted.area)} · {formatRwf(posted.proposedPrice)}
          </p>
          <p className="text-body text-muted mt-1">
            {posted.matchingWorkers.length > 0
              ? `Visible to ${posted.matchingWorkers.length} ${categoryLabel(posted.category).toLowerCase()} worker${posted.matchingWorkers.length === 1 ? '' : 's'} in ${areaLabel(posted.area)}.`
              : `No ${categoryLabel(posted.category).toLowerCase()} workers in ${areaLabel(posted.area)} yet.`}
          </p>
          <Button to={`/my-jobs/${posted._id}`} variant="dark" size="md" className="mt-3">See offers</Button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <p className="text-label text-ink mb-2">What do you need?</p>
          <ChipRow label="What do you need?">
            {CATEGORIES.map(c => (
              <Chip key={c.value} active={c.value === category} onClick={() => setCategory(c.value)}>{c.label}</Chip>
            ))}
          </ChipRow>
        </div>

        <FormField label="Describe the job">
          {field => (
            <TextArea {...field} required value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Kitchen tap is leaking, needs replacing" />
          )}
        </FormField>

        <div>
          <p className="text-label text-ink mb-2">Area</p>
          <ChipRow label="Area">
            {AREAS.map(a => (
              <Chip key={a.value} active={a.value === area} onClick={() => setArea(a.value)}>{a.label}</Chip>
            ))}
          </ChipRow>
        </div>

        <FormField label="Your price (RWF)" helper="Workers can accept this price or send one counter-offer." error={error}>
          {field => <PriceInput {...field} value={proposedPrice} onChange={setProposedPrice} placeholder="15,000" />}
        </FormField>

        <Button type="submit" disabled={submitting}>{submitting ? 'Posting…' : 'Post job'}</Button>
      </form>
    </PageLayout>
  );
}
