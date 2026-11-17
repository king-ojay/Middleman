// In the Android app (and an installed PWA) the page runs under the phone's
// status bar. This strip, in the page's own colour, stays behind the bar so
// scrolled content never runs under the time and icons; PageLayout starts
// each page below it. Its height is --safe-top (styles/index.css): 0 in a
// normal browser tab, where it takes no space.
export default function StatusBarBackdrop() {
  return <div aria-hidden="true" data-testid="status-bar-backdrop" className="fixed inset-x-0 top-0 z-40 h-[var(--safe-top)] bg-canvas" />;
}
