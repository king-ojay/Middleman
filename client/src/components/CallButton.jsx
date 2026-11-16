import { buttonClasses } from './ui/Button.jsx';
import { firstName } from '../greeting.js';
import { telHref } from '../format.js';

const PhoneIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
  </svg>
);

// "Call <first name>": a tel: link to the other party of an active job. The
// server sends the number (otherPartyPhone) only to the job's own client and
// worker and only while the job is active, so the button shows exactly then.
export default function CallButton({ phone, person, className = '' }) {
  if (!phone) return null;
  return (
    <a href={telHref(phone)} className={buttonClasses({ variant: 'secondary', size: 'md', className: `shrink-0 ${className}` })}>
      <PhoneIcon />
      Call {firstName(person)}
    </a>
  );
}
