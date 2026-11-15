import { Button } from './ui/index.js';

// A worker's profile link on a ranked card: a real link (keyboard-focusable,
// 44px tall), named for the worker for screen readers ("View profile of Eric
// Habimana"). `label` is the visible part: "View profile", "Profile", "View".
export default function ProfileButton({ worker, label = 'View profile', variant = 'secondary', size = 'md', className = '' }) {
  return (
    <Button to={`/people/${worker._id}`} variant={variant} size={size} className={className}>
      {label}<span className="sr-only"> {label === 'View' ? 'profile ' : ''}of {worker.name}</span>
    </Button>
  );
}
