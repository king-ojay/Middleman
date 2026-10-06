// Labelled trust tier rather than a raw score (Section 3.3.3). Used for
// workers shown to clients and for clients shown to workers.
export const tierStyles = {
  network: { border: 'border-l-steel', badge: 'bg-steel text-paper', label: 'Trusted in your network' },
  area: { border: 'border-l-sisal', badge: 'bg-sisal/20 text-ink', label: 'Trusted in this area' },
  fallback: { border: 'border-l-ink/15', badge: 'bg-ink/5 text-ink/60', label: 'New — not yet rated' }
};

export const tierFor = trustSource => tierStyles[trustSource] || tierStyles.fallback;

export default function TrustBadge({ trustSource }) {
  const tier = tierFor(trustSource);
  return <span className={`text-xs px-2 py-0.5 rounded-sm ${tier.badge}`}>{tier.label}</span>;
}
