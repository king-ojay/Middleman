// Round initials avatar. Its fill follows the person's trust tier (never a
// number), so the tier reads at a glance in lists: ink for your network, the
// green tint for area trust, neutral for new. `anonymous` draws a blank grey
// circle for someone on a trust path who is never named.
import { tierKey } from './TierBadge.jsx';

const SIZES = {
  32: 'w-8 h-8 text-micro',
  40: 'w-10 h-10 text-label',
  44: 'w-11 h-11 text-label',
  52: 'w-[52px] h-[52px] text-card',
  88: 'w-[88px] h-[88px] text-title'
};

const TIER_FILL = {
  network: 'bg-ink text-on-ink',
  area: 'bg-trust text-on-trust',
  new: 'bg-soft text-muted'
};

export const initials = name =>
  (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

export default function Avatar({ name, tier = 'network', size = 44, anonymous = false, className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${SIZES[size]} ${anonymous ? 'bg-soft' : TIER_FILL[tierKey(tier)]} ${className}`}
    >
      {anonymous ? '' : initials(name)}
    </span>
  );
}
