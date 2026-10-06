// The trust mechanism in one picture: a referral edge (dashed), a rating edge,
// and the inferred trust that results. Drawn for a dark (forest) surface.
export default function TrustGraphMark({ className = '' }) {
  return (
    <svg viewBox="0 0 260 140" className={className} role="img" aria-label="You invited Amina; Amina hired and rated Eric; so Eric ranks higher for you">
      <path d="M40 30 H150" className="stroke-mint" strokeWidth="2" strokeDasharray="5 5" />
      <path d="M150 30 L90 110" className="stroke-mint" strokeWidth="2" />
      <path d="M40 40 Q10 80 80 112" fill="none" className="stroke-signal" strokeWidth="2" strokeDasharray="4 4" />
      <circle cx="40" cy="30" r="24" className="fill-mint" />
      <circle cx="150" cy="30" r="24" className="fill-mint" />
      <circle cx="90" cy="112" r="24" className="fill-signal" />
      <text x="40" y="34" textAnchor="middle" className="fill-forest font-sans text-micro font-semibold">You</text>
      <text x="150" y="34" textAnchor="middle" className="fill-forest font-sans text-micro font-semibold">Amina</text>
      <text x="90" y="116" textAnchor="middle" className="fill-on-signal font-sans text-micro font-semibold">Eric</text>
    </svg>
  );
}
