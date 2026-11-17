// Shown on every screen of the pilot build: escrow runs on the MTN MoMo
// sandbox (or the fake provider), so no real money ever moves.
// In the Android app (and an installed PWA) the page runs under the phone's
// status bar: the banner starts below it, and a strip in the banner's colour
// stays behind the bar so scrolled content never runs under the time and
// icons. In a normal browser tab the inset is 0 and the strip has no height.
export default function SandboxBanner() {
  return (
    <>
      <div aria-hidden="true" className="fixed inset-x-0 top-0 z-40 h-[env(safe-area-inset-top)] bg-warn" />
      <p role="note" className="bg-warn text-on-warn text-micro text-center px-4 pb-1.5 pt-[calc(env(safe-area-inset-top)+0.375rem)]">
        Sandbox – no real money
      </p>
    </>
  );
}
