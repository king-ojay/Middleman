// The one button style for the app: pills in primary (ink), secondary
// (white with a thin border), soft and plain variants, in two sizes, both at
// least 44px tall; renders a router Link when given `to`.
import { Link } from 'react-router-dom';

// Hover (pointer devices only, see tailwind.config.js) and pressed states:
// ink buttons lighten slightly, white ones take the neutral tint, plain text
// actions turn ink.
const VARIANTS = {
  primary: 'bg-ink text-on-ink hover:opacity-90 active:opacity-80',
  secondary: 'bg-surface border border-line text-ink hover:bg-soft active:bg-soft',
  soft: 'bg-soft text-ink hover:brightness-95 active:brightness-90',
  plain: 'bg-transparent text-muted hover:text-ink active:text-ink' // low-emphasis text action, e.g. "Report a problem"
};
// Older names for the same looks.
VARIANTS.dark = VARIANTS.primary;
VARIANTS.outline = VARIANTS.secondary;

const SIZES = {
  lg: 'min-h-14 w-full px-6',
  md: 'min-h-11 px-5'
};

export function buttonClasses({ variant = 'primary', size = 'lg', className = '' } = {}) {
  return [
    'inline-flex items-center justify-center gap-2 rounded-full text-body font-bold text-center transition-[opacity,filter,background-color,color]',
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:filter-none aria-disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    className
  ].join(' ');
}

// Renders a router Link when `to` is given, otherwise a <button>.
export default function Button({ variant, size, className, to, type = 'button', ...props }) {
  const classes = buttonClasses({ variant, size, className });
  if (to) return <Link to={to} className={classes} {...props} />;
  return <button type={type} className={classes} {...props} />;
}
