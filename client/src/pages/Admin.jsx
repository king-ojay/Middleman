// The researcher's page, separate from the user app: verify workers met in
// person (FR-04) and settle disputes (FR-14). It asks for ADMIN_SECRET and
// keeps it in memory only, so it is gone on reload or "Lock". Uses the
// existing admin routes (adminAuth.js); not linked from any tab bar.
import { useEffect, useState } from 'react';
import { adminApi } from '../api.js';
import { formatRwf, timeAgo } from '../format.js';
import { categoryLabel, areaLabel } from '../options.js';
import { Button, Card, FormField, PageLayout, Sheet, TextInput } from '../components/ui/index.js';
import LoadError from '../components/LoadError.jsx';

export default function Admin() {
  const [secret, setSecret] = useState('');
  const [typed, setTyped] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  // The secret is accepted once a protected list loads with it.
  const unlock = async e => {
    e.preventDefault();
    setError('');
    setChecking(true);
    try {
      await adminApi('/api/admin/disputes', typed);
      setSecret(typed);
      setTyped('');
    } catch (err) {
      setError(err.status === 401 ? 'That secret is not right.' : err.message);
    } finally {
      setChecking(false);
    }
  };

  if (!secret) {
    return (
      <PageLayout title="Admin" subtitle="For the researcher only. Enter the admin secret to continue.">
        <form onSubmit={unlock} className="space-y-5">
          <FormField label="Admin secret" error={error} helper="Kept only while this page is open.">
            {field => (
              <TextInput {...field} type="password" autoComplete="off" value={typed} onChange={e => setTyped(e.target.value)} required />
            )}
          </FormField>
          <Button type="submit" disabled={checking || !typed}>{checking ? 'Checking…' : 'Continue'}</Button>
        </form>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Admin" width="medium" right={<Button variant="plain" size="md" onClick={() => setSecret('')}>Lock</Button>}>
      <Verification secret={secret} />
      <Disputes secret={secret} />
    </PageLayout>
  );
}

// Loads one admin list; `reload` asks again, and the error offers "Try again".
function useAdminList(path, secret) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const load = () => adminApi(path, secret).then(data => { setItems(data); setError(null); }).catch(setError);
  useEffect(() => { load(); }, [path, secret]);
  const tryAgain = () => {
    setRetrying(true);
    load().finally(() => setRetrying(false));
  };
  return { items, setItems, error, retrying, tryAgain, reload: load };
}

// Section 1: workers not yet verified. Marking one records researcher,
// now and in-person on the server (verification.js).
function Verification({ secret }) {
  const { items, setItems, error, retrying, tryAgain } = useAdminList('/api/admin/verification/unverified', secret);
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState('');
  const [done, setDone] = useState('');

  const verify = async worker => {
    setActionError('');
    setDone('');
    setBusy(worker._id);
    try {
      await adminApi('/api/admin/verification/verify', secret, { method: 'POST', body: JSON.stringify({ userId: worker._id }) });
      setItems(list => list.filter(w => w._id !== worker._id));
      setDone(`${worker.name} is verified.`);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section>
      <h2 className="text-section text-ink mb-1">Verification</h2>
      <p className="text-body text-muted mb-4">Workers not yet verified. Mark one only after checking them in person.</p>
      {error && <LoadError prefix="Couldn't load workers" error={error} retrying={retrying} onRetry={tryAgain} />}
      {!error && !items && <p className="text-body text-muted">Loading…</p>}
      {done && <p className="text-body text-heading bg-mint rounded-field px-4 py-3 mb-3" role="status">{done}</p>}
      {actionError && <p className="text-body text-danger mb-3" role="alert">{actionError}</p>}
      {items?.length === 0 && <p className="text-body text-muted">Every worker is verified.</p>}
      {items?.length > 0 && (
        <ul className="grid gap-3">
          {items.map(w => (
            <Card as="li" key={w._id} className="p-5 flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-card text-ink">{w.name}</h3>
                <p className="text-body text-muted">
                  {(w.skills || []).map(categoryLabel).join(', ')} · {areaLabel(w.area)} · phone ending {w.phoneEnding}
                </p>
              </div>
              <Button size="md" onClick={() => verify(w)} disabled={busy !== null}>
                {busy === w._id ? 'Saving…' : 'Mark verified (in person)'}
              </Button>
            </Card>
          ))}
        </ul>
      )}
    </section>
  );
}

const OUTCOMES = {
  release: { button: 'Release to worker', confirm: amount => `Release ${amount} to the worker?`, done: 'Released to the worker.' },
  refund: { button: 'Refund client', confirm: amount => `Refund ${amount} to the client?`, done: 'Refunded to the client.' }
};

// Section 2: jobs whose escrow is locked by a reported problem. Each outcome
// goes through a confirm step; a payout the provider has not finished yet
// stays listed as in progress.
function Disputes({ secret }) {
  const { items, error, retrying, tryAgain, reload } = useAdminList('/api/admin/disputes', secret);
  const [confirming, setConfirming] = useState(null); // { job, outcome }
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState('');
  const [done, setDone] = useState('');

  const settle = async () => {
    const { job, outcome } = confirming;
    setActionError('');
    setSending(true);
    try {
      const result = await adminApi(`/api/admin/jobs/${job._id}/${outcome}`, secret, { method: 'POST' });
      setDone(result.escrow?.pending ? 'Sent to the provider. It shows as in progress until the payout finishes.' : OUTCOMES[outcome].done);
      setConfirming(null);
      reload();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="mt-10">
      <h2 className="text-section text-ink mb-1">Disputes</h2>
      <p className="text-body text-muted mb-4">Jobs where someone reported a problem. The money stays locked until you settle it.</p>
      {error && <LoadError prefix="Couldn't load disputes" error={error} retrying={retrying} onRetry={tryAgain} />}
      {!error && !items && <p className="text-body text-muted">Loading…</p>}
      {done && <p className="text-body text-heading bg-mint rounded-field px-4 py-3 mb-3" role="status">{done}</p>}
      {items?.length === 0 && <p className="text-body text-muted">No open disputes.</p>}
      {items?.length > 0 && (
        <ul className="grid gap-3">
          {items.map(job => {
            const reporter = String(job.disputedBy) === String(job.client) ? 'the client' : 'the worker';
            return (
              <Card as="li" key={job._id} className="p-5">
                <h3 className="text-card text-ink break-words">{job.description}</h3>
                <p className="text-body text-muted mt-1">
                  {categoryLabel(job.category)} · {areaLabel(job.area)} · reported by {reporter} {timeAgo(job.disputedAt)}
                </p>
                <p className="text-small text-muted mt-3">Locked in escrow</p>
                <p className="text-section text-ink">{formatRwf(job.escrow?.amount ?? job.agreedPrice)}</p>
                {job.escrow?.pending ? (
                  <p className="text-body text-muted bg-soft rounded-field px-4 py-3 mt-4" role="status">
                    {job.escrow.pending.kind === 'release' ? 'Release' : 'Refund'} in progress with the provider.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-3 mt-4">
                    {Object.entries(OUTCOMES).map(([outcome, o]) => (
                      <Button
                        key={outcome}
                        size="md"
                        variant={outcome === 'release' ? 'primary' : 'outline'}
                        onClick={() => { setActionError(''); setDone(''); setConfirming({ job, outcome }); }}
                      >
                        {o.button}
                      </Button>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </ul>
      )}

      <Sheet open={confirming !== null} title="Settle this dispute" onClose={() => !sending && setConfirming(null)}>
        {confirming && (
          <div className="space-y-4">
            <p className="text-body text-ink">
              {OUTCOMES[confirming.outcome].confirm(formatRwf(confirming.job.escrow?.amount ?? confirming.job.agreedPrice))}
            </p>
            <p className="text-body text-muted">“{confirming.job.description}”. This closes the dispute and cannot be undone.</p>
            {actionError && <p className="text-small text-danger" role="alert">{actionError}</p>}
            <Button onClick={settle} disabled={sending}>{sending ? 'Sending…' : OUTCOMES[confirming.outcome].button}</Button>
            <Button variant="outline" onClick={() => setConfirming(null)} disabled={sending}>Cancel</Button>
          </div>
        )}
      </Sheet>
    </section>
  );
}
