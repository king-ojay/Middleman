import { categoryLabel, areaLabel } from '../options.js';
import TrustBadge, { tierFor } from './TrustBadge.jsx';

export default function WorkerCard({ worker }) {
  const tier = tierFor(worker.trustSource);
  return (
    <div className={`bg-white/50 border border-ink/10 border-l-4 ${tier.border} rounded-sm px-5 py-4`}>
      <div>
        <div className="flex items-center gap-3">
          <h3 className="font-medium text-ink">{worker.name}</h3>
          <TrustBadge trustSource={worker.trustSource} />
        </div>
        <p className="text-sm text-ink/60 mt-1">
          {(worker.skills || []).map(categoryLabel).join(', ')} · {areaLabel(worker.area)}
        </p>
      </div>
    </div>
  );
}
