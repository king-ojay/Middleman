import { useEffect, useId, useRef } from 'react';
import { t } from '../../i18n/index.js';

// Bottom sheet dialog on phones, a centred dialog from 768px. Closes with its Close button, Escape or a tap
// outside; focus moves into the sheet's first field when it opens, Tab and Shift+Tab stay inside the sheet
// while it is open, and focus goes back to where it was (the button on the card that opened it) when it
// closes.
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
    panel.current?.querySelector('input, button:not([data-sheet-close]), textarea')?.focus();
    const onKey = e => {
      if (e.key === 'Escape') return close.current();
      if (e.key !== 'Tab' || !panel.current) return;
      const items = [...panel.current.querySelectorAll(FOCUSABLE)];
      if (items.length === 0) return;
      // The sheet moves focus itself on every Tab (Safari's own Tab skips
      // buttons, which would leave the sheet), wrapping at either end.
      e.preventDefault();
      const at = items.indexOf(document.activeElement);
      const next = at === -1 ? (e.shiftKey ? items.length - 1 : 0) : (at + (e.shiftKey ? -1 : 1) + items.length) % items.length;
      items[next].focus();
    };
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
      <div className="absolute inset-0 bg-scrim/60" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full md:max-w-[520px] max-h-[90dvh] overflow-y-auto overscroll-contain bg-surface rounded-t-hero md:rounded-hero px-screen pt-3 md:pt-6 pb-[max(env(safe-area-inset-bottom),24px)] shadow-float"
      >
        <span aria-hidden="true" className="block mx-auto w-10 h-1 rounded-full bg-line mb-5 md:hidden" />
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 id={titleId} className="text-section text-ink">{title}</h2>
          <button
            type="button"
            data-sheet-close
            onClick={onClose}
            className="shrink-0 h-11 -mr-3 px-3 rounded-full text-body font-semibold text-ink transition-colors hover:bg-soft active:bg-soft"
          >
            {t('common.close')}
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}