// Segmented progress for multi-step flows (registration is 2 steps).
export default function StepBar({ step, total = 2 }) {
  return (
    <div className="flex gap-3 mb-6" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step} aria-label={`Step ${step} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`h-1.5 flex-1 rounded-full ${i < step ? 'bg-signal' : 'bg-line'}`} />
      ))}
    </div>
  );
}
