import { Button } from './ui/index.js';

// "View profile" on a ranked worker's card: a real link (keyboard-focusable,
// 44px tall), named for the worker for screen readers.
export default function ProfileButton({ worker, variant = 'outline', className = '' }) {
  return (
    <Button to={`/people/${worker._id}`} variant={variant} size="md" className={className}>
      View profile<span className="sr-only"> of {worker.name}</span>
    </Button>
  );
}
