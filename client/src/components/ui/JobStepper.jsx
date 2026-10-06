const STEPS = ['Accepted', 'Started', 'Done', 'Confirm'];

// How many steps a status has completed (Fig. 5 order).
const COMPLETED = { quote_accepted: 1, escrow_held: 1, in_progress: 2, awaiting_confirmation: 3, completed: 4, disputed: 0 };

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="m3 7.5 2.5 2.5L11 4.5" className="stroke-on-signal" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function JobStepper({ status }) {
  const done = COMPLETED[status] ?? 0;
  return (
    <ol className="flex items-start mb-6" aria-label="Job progress">
      {STEPS.map((label, i) => {
        const isDone = i < done;
        const isCurrent = i === done;
        return (
          <li key={label} className="flex-1 flex flex-col items-center relative">
            {i > 0 && <span aria-hidden="true" className={`absolute top-3 right-1/2 w-full h-0.5 ${i <= done ? 'bg-signal' : 'bg-line'}`} />}
            <span
              className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center ${
                isDone ? 'bg-signal' : isCurrent ? 'bg-white border-[3px] border-signal' : 'bg-white border-2 border-line'
              }`}
            >
              {isDone && <Check />}
            </span>
            <span className={`mt-2 text-small ${isCurrent ? 'font-semibold text-forest' : 'text-muted'}`}>
              {label}
              <span className="sr-only">{isDone ? ' (done)' : isCurrent ? ' (current)' : ''}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
