// A large selectable tile (e.g. "Client / I need work done"). Behaves as a
// radio button inside a role="radiogroup". Selected: a 2px ink edge.
export default function OptionCard({ selected, title, description, onSelect }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`text-left rounded-card p-4 min-h-[96px] bg-surface transition-colors ${
        selected ? 'ring-2 ring-inset ring-ink' : 'ring-1 ring-inset ring-line hover:ring-ink'
      }`}
    >
      <span aria-hidden="true" className={`flex items-center justify-center w-8 h-8 rounded-full mb-3 ${selected ? 'bg-ink' : 'bg-soft'}`}>
        {selected && (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="m3 7.5 2.5 2.5L11 4.5" className="stroke-on-ink" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="block text-card text-ink">{title}</span>
      <span className="block text-small text-muted">{description}</span>
    </button>
  );
}
