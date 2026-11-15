// Round initials avatar. Its fill follows the person's trust tier (never a
// number), so the tier reads at a glance in lists: the green tint for your
// network (and your own profile), the neutral tint for everyone else. `anonymous` draws a blank grey
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
  network: 'bg-trust text-on-trust',
  area: 'bg-soft text-ink',
  new: 'bg-soft text-ink'
};

export const initials = name =>
  (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

export default function Avatar({ name, tier = 'network', size = 44, anonymous = false, className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${SIZES[size]} ${anonymous ? 'bg-soft' : TIER_FILL[tierKey(tier)]} ${className}`}
    >
      {anonymous ? '' : initials(name)}
    </span>
  );
}
