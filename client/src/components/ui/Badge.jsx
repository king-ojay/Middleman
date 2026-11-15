// Tones are the token tints. `trust` and `ink` (neutral tint, ink text) are
// for trust and money states; `action` (amber) means this person has something to do.
const TONES = {
  trust: 'bg-trust text-on-trust',
  ink: 'bg-soft text-ink',
  soft: 'bg-soft text-muted',
  white: 'bg-surface text-ink border border-line',
  action: 'bg-warn text-on-warn',
  problem: 'bg-danger-soft text-danger'
};
// Older names for the same looks.
TONES.signal = TONES.trust;
TONES.mint = TONES.trust;

// Small pill label. Always carries text, never colour alone.
export default function Badge({ tone = 'soft', className = '', children }) {
  return (
    <span className={`inline-flex items-center h-[26px] px-2.5 rounded-full text-micro whitespace-nowrap ${TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}
