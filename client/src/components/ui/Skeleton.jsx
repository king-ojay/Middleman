// Placeholders shown while a screen waits for the API (on the free host that
// can be up to a minute while the server wakes). Each screen draws skeletons
// in the shape of its real content, so nothing jumps when the data arrives.
import { useSlowNotice } from '../../slowNotice.js';

// The pulse is off for people who ask for reduced motion (motion-reduce), not
// just shortened: index.css cuts every animation to 0.01ms, which would make
// an endless pulse flicker.
const FILL = { surface: 'bg-soft', canvas: 'bg-line' };

// One grey block. `on` is what it sits on: inside a Card (surface) or straight
// on the page (canvas), where soft would barely show.
export default function Skeleton({ on = 'surface', className = '' }) {
  return <span className={`block animate-pulse motion-reduce:animate-none ${FILL[on]} ${className}`} />;
}

// A line of text in a given type size: the row is the type's line height, so
// a skeleton line takes exactly the space the real line will.
const LINE = {
  display: 'h-[37px]', title: 'h-[32px]', section: 'h-[23px]', card: 'h-[22px]',
  body: 'h-6', label: 'h-5', small: 'h-[18px]'
};
export function SkeletonText({ size = 'body', on, className = '' }) {
  return (
    <span className={`flex items-center ${LINE[size]} ${className}`}>
      <Skeleton on={on} className="h-[60%] w-full rounded-full" />
    </span>
  );
}

// The line shown under a loading state or a busy button once the wait passes
// SLOW_NOTICE_MS. Always rendered (empty until then) so screen readers hear
// it when the text appears.
export function SlowNotice({ active, className = '' }) {
  const slow = useSlowNotice(active);
  return (
    <p role="status" className={slow ? `text-small text-muted ${className}` : 'sr-only'}>
      {slow ? 'Starting the server, this can take up to a minute.' : ''}
    </p>
  );
}

// Wraps a screen's skeletons: hidden from screen readers, which hear `label`
// instead, and marked busy until the real content replaces it.
export function LoadingState({ label, children }) {
  return (
    <div aria-busy="true">
      <div aria-hidden="true">{children}</div>
      <span className="sr-only" role="status">{label}</span>
      <SlowNotice active className="mt-4 text-center" />
    </div>
  );
}
