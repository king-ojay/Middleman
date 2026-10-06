// 52x30 track, 24px white knob. Labelled by the caller via aria-label or
// aria-labelledby.
export default function Switch({ checked, onChange, className = '', ...props }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex shrink-0 w-[52px] h-[30px] rounded-full transition-colors ${checked ? 'bg-signal' : 'bg-soft'} ${className}`}
      {...props}
    >
      <span className={`absolute top-[3px] left-[3px] w-6 h-6 rounded-full bg-white shadow-card transition-transform ${checked ? 'translate-x-[22px]' : ''}`} />
    </button>
  );
}
