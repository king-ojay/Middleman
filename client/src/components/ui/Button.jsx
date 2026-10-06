import { Link } from 'react-router-dom';

const VARIANTS = {
  primary: 'bg-signal text-on-signal',
  dark: 'bg-forest text-white',
  soft: 'bg-mint text-forest',
  outline: 'bg-white border border-line text-ink'
};

const SIZES = {
  lg: 'h-14 w-full px-6',
  md: 'h-11 px-5'
};

export function buttonClasses({ variant = 'primary', size = 'lg', className = '' } = {}) {
  return [
    'inline-flex items-center justify-center rounded-full text-body font-semibold transition-opacity',
    'disabled:opacity-50 disabled:cursor-not-allowed aria-disabled:opacity-50',
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
