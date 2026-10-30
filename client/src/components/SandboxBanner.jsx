// Shown on every screen of the pilot build: escrow runs on the MTN MoMo
// sandbox (or the fake provider), so no real money ever moves.
export default function SandboxBanner() {
  return (
    <p role="note" className="bg-accent-soft text-heading text-micro text-center px-4 py-1.5">
      Sandbox – no real money
    </p>
  );
}
