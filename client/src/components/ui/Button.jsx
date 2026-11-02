// The one button style for the app: primary, dark, soft, outline and plain
// variants in two sizes; renders a router Link when given `to`.
import { Link } from 'react-router-dom';

// Hover (pointer devices only, see tailwind.config.js) and pressed states:
// filled buttons darken slightly, outline ones take a soft fill, plain text
// actions turn the heading colour.
const VARIANTS = {
  primary: 'bg-accent text-on-accent hover:brightness-95 active:brightness-90',
  dark: 'bg-brand text-white hover:brightness-110 active:brightness-125',
  soft: 'bg-mint text-heading hover:brightness-95 active:brightness-90',
  outline: 'bg-surface border border-line text-ink hover:bg-soft active:bg-soft',
  plain: 'bg-transparent text-muted hover:text-heading active:text-heading' // low-emphasis text action, e.g. "Report a problem"
};

const SIZES = {
  lg: 'h-14 w-full px-6',
  md: 'h-11 px-5'
};

export function buttonClasses({ variant = 'primary', size = 'lg', className = '' } = {}) {
  return [
    'inline-flex items-center justify-center rounded-full text-body font-semibold transition-[opacity,filter,background-color,color]',
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
