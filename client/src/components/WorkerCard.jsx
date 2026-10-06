import { categoryLabel, areaLabel } from '../options.js';
import TrustBadge, { tierFor } from './TrustBadge.jsx';

export default function WorkerCard({ worker }) {
  const tier = tierFor(worker.trustSource);
  return (
    <div className={`flex items-center justify-between gap-6 bg-white/50 border border-ink/10 border-l-4 ${tier.border} rounded-sm px-5 py-4`}>
      <div>
        <div className="flex items-center gap-3">
          <h3 className="font-medium text-ink">{worker.name}</h3>
          <TrustBadge trustSource={worker.trustSource} />
        </div>
        <p className="text-sm text-ink/60 mt-1">
          {(worker.skills || []).map(categoryLabel).join(', ')} · {areaLabel(worker.area)}
        </p>
      </div>
      <button className="px-4 py-2 text-sm font-medium border border-ink/20 rounded hover:border-ink/40 transition-colors shrink-0">
        Request quote
      </button>
    </div>
  );
}
