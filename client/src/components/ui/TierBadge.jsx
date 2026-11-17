import Badge from './Badge.jsx';
import { t } from '../../i18n/index.js';

// Labelled trust tier, never a raw score (Section 3.3.3). Accepts the API's
// trustSource values too ('fallback' is the "new" tier).
const TONES = { network: 'trust', area: 'trust', new: 'soft' };

export const tierKey = tier => (tier === 'network' || tier === 'area' ? tier : 'new');

export default function TierBadge({ tier }) {
  const key = tierKey(tier);
  return <Badge tone={TONES[key]}>{t(`tier.${key}`)}</Badge>;
}
