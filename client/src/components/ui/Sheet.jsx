import { useEffect, useId, useRef } from 'react';

// Bottom sheet dialog. Closes on Escape or a tap outside; focus moves into
// the sheet when it opens and back to where it was when it closes.
export default function Sheet({ open, title, onClose, children }) {
  const titleId = useId();
  const panel = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    panel.current?.querySelector('input, button, textarea')?.focus();
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-[430px] bg-white rounded-t-hero px-screen pt-3 pb-[max(env(safe-area-inset-bottom),24px)] shadow-tabbar"
      >
        <span aria-hidden="true" className="block mx-auto w-10 h-1 rounded-full bg-line mb-5" />
        <h2 id={titleId} className="text-section text-ink mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}
