import { t, tn } from '../../i18n/index.js';

function Star({ filled, size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.5l2.9 6.2 6.6.7-5 4.5 1.4 6.6L12 17.2l-5.9 3.3 1.4-6.6-5-4.5 6.6-.7z"
        className={filled ? 'fill-ink' : 'fill-line'}
      />
    </svg>
  );
}

// Input: five stars with 48px hit areas. Read-only: small inline stars.
export default function StarRating({ value = 0, onChange, readOnly = false, label = t('stars.rating') }) {
  if (readOnly) {
    return (
      <span className="inline-flex gap-0.5" role="img" aria-label={t('stars.outOf5', { n: value })}>
        {[1, 2, 3, 4, 5].map(n => <Star key={n} filled={n <= value} size={16} />)}
      </span>
    );
  }
  return (
    <div role="radiogroup" aria-label={label} className="flex -ml-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={tn('stars', n)}
          onClick={() => onChange(n)}
          className="w-12 h-12 flex items-center justify-center transition-transform hover:scale-110"
        >
          <Star filled={n <= value} size={40} />
        </button>
      ))}
    </div>
  );
}
