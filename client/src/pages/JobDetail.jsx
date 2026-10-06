import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { formatRwf } from '../format.js';
import { categoryLabel, areaLabel, statusLabel } from '../options.js';
import JobActions from '../components/JobActions.jsx';
import TrustBadge, { tierFor } from '../components/TrustBadge.jsx';

export default function JobDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');

  const load = () => api(`/api/jobs/${id}`).then(setJob).catch(err => setError(err.message));
  useEffect(() => { load(); }, [id]);

  if (error) return <Page><p className="text-sm text-brick">Couldn't load this job: {error}</p></Page>;
  if (!job) return <Page><p className="text-sm text-ink/50">Loading…</p></Page>;

  const isClient = user.role === 'client';

  return (
    <Page>
      <h1 className="font-display text-3xl text-ink mb-2">{job.description}</h1>
      <p className="text-ink/60">
        {categoryLabel(job.category)} · {areaLabel(job.area)} · {isClient ? 'your price' : `${job.client?.name}'s price`} {formatRwf(job.proposedPrice)}
      </p>
      <p className="text-ink mt-2 mb-6">{statusLabel(job.status, user.role)}</p>

      {job.worker && (
        <div className="bg-white/50 border border-ink/10 rounded-sm px-5 py-4 mb-6">
          <p className="text-sm text-ink">
            {isClient ? `Worker: ${job.worker.name}` : `Client: ${job.client?.name}`} · agreed price {formatRwf(job.agreedPrice)}
            {job.depositAmount > 0 && ` · materials deposit ${formatRwf(job.depositAmount)}`}
          </p>
          <JobActions job={job} role={user.role} onChange={load} />
        </div>
      )}

      {isClient && job.status === 'open' && <Responses job={job} onChosen={load} />}
    </Page>
  );
}

function Page({ children }) {
  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <Link to="/my-jobs" className="text-sm text-ink/60 hover:text-ink">← My jobs</Link>
      <div className="mt-4">{children}</div>
    </div>
  );
}

// Every worker response to the client's price, ranked by trust (FR-05b).
function Responses({ job, onChosen }) {
  const [choosing, setChoosing] = useState(null);
  const [error, setError] = useState('');

  const choose = async quoteId => {
    setError('');
    setChoosing(quoteId);
    try {
      await api(`/api/jobs/${job._id}/select`, { method: 'POST', body: JSON.stringify({ quoteId }) });
      onChosen();
    } catch (err) {
      setError(err.message);
      setChoosing(null);
    }
  };

  if (job.responses.length === 0) {
    return <p className="text-sm text-ink/60">No responses yet. Workers nearby can see your job and will respond here.</p>;
  }

  return (
    <>
      <h2 className="font-display text-2xl text-ink mb-1">Responses</h2>
      <p className="text-ink/60 mb-4">Ranked by trust in your network first — not by lowest price.</p>
      {error && <p className="text-sm text-brick mb-3">{error}</p>}
      <div className="space-y-3">
        {job.responses.map(r => (
          <div key={r._id} className={`flex items-center justify-between gap-6 bg-white/50 border border-ink/10 border-l-4 ${tierFor(r.trustSource).border} rounded-sm px-5 py-4`}>
            <div>
              <div className="flex items-center gap-3">
                <h3 className="font-medium text-ink">{r.worker.name}</h3>
                <TrustBadge trustSource={r.trustSource} />
              </div>
              <p className="text-sm text-ink/60 mt-1">
                {r.isCounter ? `Offered ${formatRwf(r.amount)}` : `Accepted your price of ${formatRwf(r.amount)}`}
                {r.depositAmount > 0 && ` · asks ${formatRwf(r.depositAmount)} for materials first`}
              </p>
            </div>
            <button
              disabled={choosing !== null}
              onClick={() => choose(r._id)}
              className="px-4 py-2 text-sm font-medium bg-steel text-paper rounded hover:bg-steel-dark transition-colors shrink-0 disabled:opacity-60"
            >
              {choosing === r._id ? 'Choosing…' : `Choose for ${formatRwf(r.amount)}`}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
