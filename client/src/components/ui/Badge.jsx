const TONES = {
  signal: 'bg-signal text-on-signal',
  mint: 'bg-mint text-forest',
  soft: 'bg-soft text-muted'
};

// Small pill label. Always carries text, never colour alone.
export default function Badge({ tone = 'soft', children }) {
  return (
    <span className={`inline-flex items-center h-[26px] px-2.5 rounded-full text-micro whitespace-nowrap ${TONES[tone]}`}>
      {children}
    </span>
  );
}
