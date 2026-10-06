// A large selectable tile (e.g. "Client / I need work done"). Behaves as a
// radio button inside a role="radiogroup".
export default function OptionCard({ selected, title, description, onSelect }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`text-left rounded-card p-4 min-h-[96px] transition-colors ${
        selected ? 'bg-mint border-2 border-signal' : 'bg-white border border-line'
      }`}
    >
      <span aria-hidden="true" className={`block w-8 h-8 rounded-full mb-3 ${selected ? 'bg-signal' : 'bg-soft'}`} />
      <span className={`block text-card ${selected ? 'text-forest' : 'text-ink'}`}>{title}</span>
      <span className="block text-small text-muted">{description}</span>
    </button>
  );
}
