import { Button } from './ui/index.js';
import { t } from '../i18n/index.js';

// A worker's profile link on a ranked card: a real link (keyboard-focusable,
// 44px tall), named for the worker for screen readers ("View profile of Eric
// Habimana"). `label` is the visible part: "View profile", "Profile", "View".
export default function ProfileButton({ worker, label = t('profileButton.view'), short = false, variant = 'secondary', size = 'md', className = '' }) {
  return (
    <Button to={`/people/${worker._id}`} variant={variant} size={size} className={className}>
      {label}<span className="sr-only">{t(short ? 'profileButton.profileOf' : 'profileButton.of', { name: worker.name })}</span>
    </Button>
  );
}
