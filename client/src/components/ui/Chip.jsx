// h-10 visual with a 44px hit area (the extra comes from vertical padding on
// the row), rounded-full, 14px medium.
export function Chip({ active = false, className = '', ...props }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={[
        'h-10 shrink-0 px-4 rounded-full text-label whitespace-nowrap transition-colors',
        active ? 'bg-forest text-white' : 'bg-white border border-line text-ink',
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
      className={`-mx-screen px-screen py-0.5 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {children}
    </div>
  );
}
