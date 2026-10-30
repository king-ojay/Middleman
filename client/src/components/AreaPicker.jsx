import { useId } from 'react';
import { AREAS } from '../options.js';

// Pick one pilot area (the list is edited in shared/areas.js). Nothing is chosen until the person
// taps one: there is no default, and no GPS or device location is used.
export default function AreaPicker({ value, onChange, label = 'Your area', error }) {
  const labelId = useId();
  return (
    <div>
      <p id={labelId} className="text-label text-ink mb-2">{label}</p>
      <div role="radiogroup" aria-labelledby={labelId} aria-required="true" aria-invalid={error ? true : undefined} className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {AREAS.map(a => {
          const selected = value === a.value;
          return (
            <button
              key={a.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(a.value)}
              className={`min-h-[52px] px-3 rounded-field text-body font-medium text-center transition-colors ${
                selected ? 'bg-accent-soft border-2 border-accent text-heading' : 'bg-surface border border-line text-ink'
              }`}
            >
              {a.label}
            </button>
          );
        })}
      </div>
      {error && <p className="text-small text-danger mt-2" role="alert">{error}</p>}
    </div>
  );
}
