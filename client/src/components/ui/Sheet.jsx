import { useEffect, useId, useRef } from 'react';

// Bottom sheet dialog on phones, a centred dialog from 768px. Closes on Escape or a tap outside; focus moves into
// the sheet when it opens and back to where it was when it closes.
export default function Sheet({ open, title, onClose, children }) {
  const titleId = useId();
  const panel = useRef(null);
  // Latest onClose without re-running the effect: callers pass a new function
  // each render, which would otherwise move focus back on every keystroke.
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    panel.current?.querySelector('input, button, textarea')?.focus();
    const onKey = e => { if (e.key === 'Escape') close.current(); };
    document.addEventListener('keydown', onKey);
    // The page behind stays put while the sheet is open (phones scroll it otherwise).
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-30 flex items-end md:items-center justify-center md:p-6">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full md:max-w-[520px] max-h-[90dvh] overflow-y-auto overscroll-contain bg-surface rounded-t-hero md:rounded-hero px-screen pt-3 md:pt-6 pb-[max(env(safe-area-inset-bottom),24px)] shadow-tabbar"
      >
        <span aria-hidden="true" className="block mx-auto w-10 h-1 rounded-full bg-line mb-5 md:hidden" />
        <h2 id={titleId} className="text-section text-ink mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}