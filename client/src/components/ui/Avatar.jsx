// Round initials avatar: ink initials on a neutral grey circle for everyone
// (the trust tier is written out in words elsewhere, never shown by colour
// alone). `anonymous` draws a blank circle for someone on a trust path who is
// never named.
const SIZES = {
  32: 'w-8 h-8 text-micro',
  40: 'w-10 h-10 text-label',
  44: 'w-11 h-11 text-label',
  52: 'w-[52px] h-[52px] text-card',
  88: 'w-[88px] h-[88px] text-title'
};


export const initials = name =>
  (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

export default function Avatar({ name, size = 44, anonymous = false, className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${SIZES[size]} ${anonymous ? 'bg-soft' : 'bg-avatar text-ink'} ${className}`}
    >
      {anonymous ? '' : initials(name)}
    </span>
  );
}
