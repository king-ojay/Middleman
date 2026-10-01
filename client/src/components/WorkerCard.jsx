const tierStyles = {
  network: { border: 'border-l-steel', badge: 'bg-steel text-paper', label: 'Trusted in your network' },
  area: { border: 'border-l-sisal', badge: 'bg-sisal/20 text-ink', label: 'Trusted in this area' },
  fallback: { border: 'border-l-ink/15', badge: 'bg-ink/5 text-ink/60', label: 'New — not yet rated' }
};

export default function WorkerCard({ worker }) {
  const tier = tierStyles[worker.trustSource] || tierStyles.fallback;
  return (
    <div className={`flex items-center justify-between gap-6 bg-white/50 border border-ink/10 border-l-4 ${tier.border} rounded-sm px-5 py-4`}>
      <div>
        <div className="flex items-center gap-3">
          <h3 className="font-medium text-ink">{worker.name}</h3>
          <span className={`text-xs px-2 py-0.5 rounded-sm ${tier.badge}`}>{tier.label}</span>
        </div>
        <p className="text-sm text-ink/60 mt-1 capitalize">
          {(worker.skills || []).join(', ')} · {worker.area?.replace('_', ' ')}
        </p>
      </div>
      <button className="px-4 py-2 text-sm font-medium border border-ink/20 rounded hover:border-ink/40 transition-colors shrink-0">
        Request quote
      </button>
    </div>
  );
}
