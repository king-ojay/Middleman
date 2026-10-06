import { useId, useRef } from 'react';

const INPUT = 'w-full bg-white border border-line rounded-field px-4 text-body text-ink placeholder:text-faint focus:border-signal focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0';

// Label above, helper or error below. Children receive the generated id via
// render prop so the label is always wired to the input.
export default function FormField({ label, helper, error, children, className = '' }) {
  const id = useId();
  const describedBy = error || helper ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      {label && <label htmlFor={id} className="block text-label text-ink mb-2">{label}</label>}
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {(error || helper) && (
        <p id={`${id}-hint`} className={`text-small mt-2 ${error ? 'text-danger' : 'text-muted'}`}>{error || helper}</p>
      )}
    </div>
  );
}

export function TextInput({ className = '', ...props }) {
  return <input className={`${INPUT} h-[54px] ${className}`} {...props} />;
}

export function TextArea({ className = '', ...props }) {
  return <textarea className={`${INPUT} h-24 py-3 resize-none ${className}`} {...props} />;
}

const formatDigits = digits => (digits ? Number(digits).toLocaleString('en-US') : '');

// Big price entry: digits only, shown with thousands separators, RWF suffix.
export function PriceInput({ value, onChange, className = '', ...props }) {
  return (
    <div className={`flex items-center h-[72px] bg-white border-2 border-signal rounded-field px-5 ${className}`}>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={formatDigits(value)}
        onChange={e => onChange(e.target.value.replace(/\D/g, '').replace(/^0+/, ''))}
        className="min-w-0 flex-1 bg-transparent text-display text-ink placeholder:text-faint focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
        {...props}
      />
      <span className="text-section font-medium text-muted ml-3">RWF</span>
    </div>
  );
}

// Four 72px boxes for a 4-digit PIN, filled left to right. Typing advances,
// Backspace clears the last digit and steps back.
export function PinBoxes({ value, onChange, id, label = 'PIN', ...props }) {
  const refs = useRef([]);
  // The latest PIN, updated before focus moves, so the focus guard below
  // never sees a stale value mid-typing.
  const current = useRef(value);
  current.current = value;

  const update = next => {
    current.current = next;
    onChange(next);
  };

  return (
    <div className="grid grid-cols-4 gap-3">
      {[0, 1, 2, 3].map(i => (
        <input
          key={i}
          id={i === 0 ? id : undefined}
          ref={el => { refs.current[i] = el; }}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={1}
          aria-label={`${label} digit ${i + 1}`}
          value={value[i] || ''}
          onFocus={() => { if (i > current.current.length) refs.current[current.current.length]?.focus(); }}
          onChange={e => {
            const digit = e.target.value.replace(/\D/g, '').slice(-1);
            if (!digit) return;
            const next = (current.current.slice(0, i) + digit).slice(0, 4);
            update(next);
            refs.current[Math.min(next.length, 3)]?.focus();
          }}
          onKeyDown={e => {
            if (e.key !== 'Backspace') return;
            e.preventDefault();
            const cut = current.current[i] ? i : Math.max(i - 1, 0);
            update(current.current.slice(0, cut));
            refs.current[cut]?.focus();
          }}
          className="h-[72px] w-full bg-white border border-line rounded-field text-center text-title text-ink focus:border-2 focus:border-signal focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          {...(i === 0 ? props : {})}
        />
      ))}
    </div>
  );
}
