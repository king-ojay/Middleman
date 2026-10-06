// Three nodes, two solid forest edges and one dashed signal edge: trust
// reaching someone you have not met through people you have.
export default function LogoMark({ size = 32, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <path d="M8 7h16" className="stroke-forest" strokeWidth="2.4" />
      <path d="M24 7 13 25" className="stroke-forest" strokeWidth="2.4" />
      <path d="M8 7l5 18" className="stroke-signal" strokeWidth="2.4" strokeDasharray="2.5 3" />
      <circle cx="8" cy="7" r="4" className="fill-white stroke-forest" strokeWidth="2.4" />
      <circle cx="24" cy="7" r="4" className="fill-white stroke-forest" strokeWidth="2.4" />
      <circle cx="13" cy="25" r="5" className="fill-forest" />
    </svg>
  );
}
