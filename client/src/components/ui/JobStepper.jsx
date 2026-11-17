import { t } from '../../i18n/index.js';

const STEPS = ['accepted', 'paid', 'started', 'done', 'confirm'];

// How many steps a status has completed (Fig. 5 order). Kinyarwanda step
// words are longer, so they are set a size smaller to fit five across a phone.
const COMPLETED = { quote_accepted: 1, escrow_held: 2, in_progress: 3, awaiting_confirmation: 4, completed: 5, disputed: 0, resolved: 0 };

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="m3 7.5 2.5 2.5L11 4.5" className="stroke-on-ink" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function JobStepper({ status }) {
  const done = COMPLETED[status] ?? 0;
  return (
    <ol className="flex items-start mb-6" aria-label={t('stepper.label')}>
      {STEPS.map((step, i) => {
        const label = t(`stepper.${step}`);
        const isDone = i < done;
        const isCurrent = i === done;
        return (
          <li key={step} className="flex-1 flex flex-col items-center relative">
            {i > 0 && <span aria-hidden="true" className={`absolute top-3 right-1/2 w-full h-0.5 ${i <= done ? 'bg-ink' : 'bg-line'}`} />}
            <span
              className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center ${
                isDone ? 'bg-ink' : isCurrent ? 'bg-surface border-[3px] border-ink' : 'bg-surface border-2 border-line'
              }`}
            >
              {isDone && <Check />}
            </span>
            <span className={`mt-2 text-small text-center [html[lang=rw]_&]:text-micro ${isCurrent ? 'font-semibold text-ink' : 'text-muted'}`}>
              {label}
              <span className="sr-only">{isDone ? t('stepper.isDone') : isCurrent ? t('stepper.isCurrent') : ''}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
