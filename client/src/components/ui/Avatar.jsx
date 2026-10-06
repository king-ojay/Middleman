import { tierKey } from './TierBadge.jsx';

const SIZES = {
  32: 'w-8 h-8 text-micro',
  44: 'w-11 h-11 text-label',
  52: 'w-[52px] h-[52px] text-card',
  88: 'w-[88px] h-[88px] text-title'
};

const TIER_FILL = {
  network: 'bg-forest text-white',
  area: 'bg-signal text-on-signal',
  new: 'bg-faint text-white'
};

export const initials = name =>
  (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

export default function Avatar({ name, tier = 'network', size = 44, className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${SIZES[size]} ${TIER_FILL[tierKey(tier)]} ${className}`}
    >
      {initials(name)}
    </span>
  );
}
