import Badge from './Badge.jsx';

// Labelled trust tier, never a raw score (Section 3.3.3). Accepts the API's
// trustSource values too ('fallback' is the "new" tier).
const TIERS = {
  network: { tone: 'signal', label: 'Trusted in your network' },
  area: { tone: 'mint', label: 'Trusted in this area' },
  new: { tone: 'soft', label: 'New · not yet rated' }
};

export const tierKey = tier => (tier === 'network' || tier === 'area' ? tier : 'new');

export default function TierBadge({ tier }) {
  const { tone, label } = TIERS[tierKey(tier)];
  return <Badge tone={tone}>{label}</Badge>;
}
