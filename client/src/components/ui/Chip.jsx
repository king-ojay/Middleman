// h-10 visual, rounded-full, 14px medium. Interactive chips extend their
// hit area 2px above and below (44px) with an invisible ::after layer.
// Pass static to render a non-interactive chip (e.g. a list of names).
export function Chip({ active = false, static: isStatic = false, className = '', ...props }) {
  const Tag = isStatic ? 'span' : 'button';
  return (
    <Tag
      {...(isStatic ? {} : { type: 'button', 'aria-pressed': active })}
      className={[
        'inline-flex items-center h-10 shrink-0 px-4 rounded-full text-label whitespace-nowrap transition-colors',
        active ? 'bg-forest text-white' : 'bg-white border border-line text-ink',
        isStatic ? '' : "relative after:absolute after:inset-x-0 after:-inset-y-0.5 after:content-['']",
        className
      ].join(' ')}
      {...props}
    />
  );
}

// One horizontal line of chips that scrolls sideways instead of wrapping.
// Bleeds to the screen edge so the last chip visibly continues off-screen.
export function ChipRow({ label, children, className = '' }) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`-mx-screen px-screen py-1 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {children}
    </div>
  );
}
