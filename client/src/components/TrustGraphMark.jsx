// A small, quiet illustration of the actual mechanism (referral edge + rating
// edge + inferred trust), used once in the hero. Not a generic stock graphic —
// it's literally the diagram from Chapter 3 of the proposal, simplified.
export default function TrustGraphMark({ className = '' }) {
  return (
    <svg viewBox="0 0 260 140" className={className} role="img" aria-label="Diagram of trust propagating from one client, through a referral, to a worker">
      <line x1="40" y1="30" x2="150" y2="30" stroke="#3B5B6B" strokeWidth="1.5" />
      <line x1="150" y1="30" x2="90" y2="110" stroke="#3B5B6B" strokeWidth="1.5" />
      <path d="M40 40 Q10 80 80 112" fill="none" stroke="#C99A44" strokeWidth="1.5" strokeDasharray="4 4" />
      <circle cx="40" cy="30" r="16" fill="#F6F1E7" stroke="#3B5B6B" strokeWidth="1.5" />
      <circle cx="150" cy="30" r="16" fill="#F6F1E7" stroke="#3B5B6B" strokeWidth="1.5" />
      <circle cx="90" cy="112" r="16" fill="#3B5B6B" />
      <text x="40" y="34" textAnchor="middle" fontSize="9" fontFamily="Work Sans" fill="#201A15">You</text>
      <text x="150" y="34" textAnchor="middle" fontSize="9" fontFamily="Work Sans" fill="#201A15">Amina</text>
      <text x="90" y="116" textAnchor="middle" fontSize="9" fontFamily="Work Sans" fill="#F6F1E7">Eric</text>
    </svg>
  );
}
