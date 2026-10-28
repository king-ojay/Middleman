import { useEffect, useState } from 'react';
import { onSlowChange } from '../api.js';

// Shown while any API request has been waiting more than 3 seconds, which on
// the free host almost always means the server is waking from sleep. Sits
// above the phone tab bar; from 768px at the bottom of the window.
export default function ServerWaking() {
  const [slow, setSlow] = useState(false);
  useEffect(() => onSlowChange(setSlow), []);
  if (!slow) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-[calc(theme(height.tabbar)+12px+env(safe-area-inset-bottom))] md:bottom-6 z-30 flex justify-center px-screen pointer-events-none"
    >
      <p className="max-w-md rounded-2xl bg-surface shadow-card px-4 py-3 text-body text-ink text-center">
        Waking up the server, this can take up to a minute
      </p>
    </div>
  );
}
