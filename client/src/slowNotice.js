import { useEffect, useState } from 'react';

// A page waiting on the API shows its own loading state (skeletons, a busy
// button) and, after SLOW_NOTICE_MS, its own "starting the server" line. While
// any of those is on screen the global ServerWaking notice stays hidden, so
// the wait is never announced twice.
export const SLOW_NOTICE_MS = 5000;

let inlineCount = 0;
const listeners = new Set();
const change = delta => {
  inlineCount += delta;
  listeners.forEach(fn => fn(inlineCount > 0));
};
export const onInlineChange = fn => {
  listeners.add(fn);
  fn(inlineCount > 0);
  return () => listeners.delete(fn);
};

// True once `active` has stayed true for SLOW_NOTICE_MS; resets when it ends.
export function useSlowNotice(active) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) return;
    change(1);
    const timer = setTimeout(() => setSlow(true), SLOW_NOTICE_MS);
    return () => { clearTimeout(timer); setSlow(false); change(-1); };
  }, [active]);
  return slow;
}
