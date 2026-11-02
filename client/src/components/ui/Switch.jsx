// 52x30 track, 24px white knob, with an invisible 44px-tall hit area (::after).
// Off, the track has a 1px muted outline so it stays visible on a white card
// (3:1 non-text contrast). Labelled by the caller via aria-label or
// aria-labelledby.
export default function Switch({ checked, onChange, className = '', ...props }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex shrink-0 w-[52px] h-[30px] rounded-full transition-[background-color,filter] hover:brightness-95 after:absolute after:inset-x-0 after:-inset-y-[7px] after:content-[''] ${checked ? 'bg-accent' : 'bg-soft ring-1 ring-inset ring-muted'} ${className}`}
      {...props}
    >
      <span className={`absolute top-[3px] left-[3px] w-6 h-6 rounded-full bg-surface shadow-card transition-transform ${checked ? 'translate-x-[22px]' : ''}`} />
    </button>
  );
}
