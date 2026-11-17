// Client posts a job: trade, description, area (defaults to their own) and price.
import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { formatRwf } from '../format.js';
import { CATEGORIES, AREAS, categoryLabel, areaLabel } from '../options.js';
import { Button, Chip, ChipRow, FormField, PageLayout, PriceInput, TextArea } from '../components/ui/index.js';
import { t, tn } from '../i18n/index.js';

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
    if (!proposedPrice) return setError(t('post.err.price'));
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
    <PageLayout title={t('post.title')} subtitle={t('post.sub')} tabBar role="client" width="medium">
      {posted && (
        <div role="status" className="bg-trust text-on-trust rounded-card p-5 mb-6">
          <p className="text-card">{t('post.posted')}</p>
          <p className="text-body mt-1">
            “{posted.description}” · {categoryLabel(posted.category)} · {areaLabel(posted.area)} · {formatRwf(posted.proposedPrice)}
          </p>
          <p className="text-body mt-1">
            {posted.matchingWorkers.length > 0
              ? tn('post.visible', posted.matchingWorkers.length, { trade: categoryLabel(posted.category).toLowerCase(), area: areaLabel(posted.area) })
              : t('post.noWorkers', { trade: categoryLabel(posted.category).toLowerCase(), area: areaLabel(posted.area) })}
          </p>
          <Button to={`/my-jobs/${posted._id}`} state={{ offers: true }} variant="dark" size="md" className="mt-3">{t('post.seeOffers')}</Button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <p className="text-label text-ink mb-2">{t('post.whatNeed')}</p>
          <ChipRow label={t('post.whatNeed')}>
            {CATEGORIES.map(c => (
              <Chip key={c.value} active={c.value === category} onClick={() => setCategory(c.value)}>{c.label}</Chip>
            ))}
          </ChipRow>
        </div>

        <FormField label={t('post.describe')}>
          {field => (
            <TextArea {...field} required value={description} onChange={e => setDescription(e.target.value)} placeholder={t('post.describePlaceholder')} />
          )}
        </FormField>

        <div>
          <p className="text-label text-ink mb-2">{t('common.area')}</p>
          <ChipRow label={t('common.area')}>
            {AREAS.map(a => (
              <Chip key={a.value} active={a.value === area} onClick={() => setArea(a.value)}>{a.label}</Chip>
            ))}
          </ChipRow>
        </div>

        <FormField label={t('post.yourPrice')} helper={t('post.priceHelper')} error={error}>
          {field => <PriceInput {...field} value={proposedPrice} onChange={setProposedPrice} placeholder="15,000" />}
        </FormField>

        <Button type="submit" disabled={submitting}>{submitting ? t('post.submitting') : t('post.submit')}</Button>
      </form>
    </PageLayout>
  );
}