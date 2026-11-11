import { Card } from './ui/index.js';

// One worker in a trust-ranked list (Discover, offers on a job). The
// first-ranked worker, when trusted through the network or the area, gets
// the emphasised card (the mint panel used for a job's summary) instead of
// the plain one. Pass your own padding in className.
export default function RankedItem({ highlighted = false, className = '', ...props }) {
  return highlighted
    ? <li className={`bg-mint rounded-card shadow-card ${className}`} {...props} />
    : <Card as="li" className={className} {...props} />;
}
