// Labelled trust tier, never a raw score (Section 3.3.3). Accepts the API's
// trustSource values too ('fallback' is the "new" tier).
const TIERS = {
  network: { className: 'bg-signal text-on-signal', label: 'Trusted in your network' },
  area: { className: 'bg-mint text-forest', label: 'Trusted in this area' },
  new: { className: 'bg-soft text-muted', label: 'New · not yet rated' }
};

export const tierKey = tier => (tier === 'network' || tier === 'area' ? tier : 'new');

export default function TierBadge({ tier }) {
  const { className, label } = TIERS[tierKey(tier)];
  return (
    <span className={`inline-flex items-center h-[26px] px-2.5 rounded-full text-micro whitespace-nowrap ${className}`}>
      {label}
    </span>
  );
}
