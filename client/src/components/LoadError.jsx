import { Button } from './ui/index.js';

// A page's load failed: the message, plus "Try again" when asking again could
// help (API unreachable or a server error, see api.js). The message stays
// while the retry runs; the button shows it is working.
export default function LoadError({ prefix, error, retrying, onRetry }) {
  return (
    <div>
      <p className="text-body text-danger" role="alert">{prefix}: {error.message}</p>
      {error.retryable && (
        <Button variant="outline" size="md" className="mt-3" onClick={onRetry} disabled={retrying} aria-busy={retrying}>
          {retrying ? 'Trying again…' : 'Try again'}
        </Button>
      )}
    </div>
  );
}
