// The researcher's page, separate from the user app: verify workers met in
// person (FR-04), settle disputes (FR-14) and delete accounts. It asks for ADMIN_SECRET and
// keeps it in memory only, so it is gone on reload or "Lock". Uses the
// existing admin routes (adminAuth.js); not linked from any tab bar.
import { useEffect, useState } from 'react';
import { adminApi } from '../api.js';
import { formatRwf, timeAgo } from '../format.js';
import { categoryLabel, areaLabel } from '../options.js';
import { Button, Card, FormField, PageLayout, Sheet, TextInput } from '../components/ui/index.js';
import LoadError from '../components/LoadError.jsx';
import DisputeSummary from '../components/DisputeSummary.jsx';

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
      <DeleteAccount secret={secret} />
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
                  {(w.skills || []).map(categoryLabel).join(', ')} · {areaLabel(w.area)} · {w.phone}
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
            const reporterRole = job.reportedBy || (String(job.disputedBy) === String(job.client) ? 'client' : 'worker');
            const reporter = `the ${reporterRole}`;
            return (
              <Card as="li" key={job._id} className="p-5">
                <h3 className="text-card text-ink break-words">{job.description}</h3>
                <p className="text-body text-muted mt-1">
                  {categoryLabel(job.category)} · {areaLabel(job.area)} · reported by {reporter} {timeAgo(job.disputedAt)}
                </p>
                <DisputeSummary job={job} reporterRole={reporterRole} className="bg-soft rounded-field px-4 py-3 mt-3" />
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

// What a deletion removes or changes (server/modules/users/deleteUser.js).
const DELETION_LABELS = {
  user: 'Account',
  otpCodes: 'Pending sign-in codes',
  ratingsGiven: 'Ratings they gave',
  ratingsReceived: 'Ratings they received',
  trustEdgesRating: 'Trust links from ratings',
  trustEdgesReferral: 'Trust links from invitations',
  offers: 'Offers',
  jobsDeleted: 'Jobs deleted (no money settled)',
  jobsKeptWithoutThem: 'Jobs kept for the other person, shown as "Deleted user"',
  jobsReopened: 'Jobs reopened for the client',
  referralsCleared: 'People they invited (link removed)',
  ledgerEntriesAnonymised: 'Payment records kept, their id removed'
};

function DeletionCounts({ counts }) {
  return (
    <dl className="grid gap-1 mt-3">
      {Object.entries(DELETION_LABELS).map(([key, label]) => (
        <div key={key} className="flex justify-between gap-4 text-body">
          <dt className="text-muted">{label}</dt>
          <dd className="text-ink font-semibold tabular-nums">{counts[key] ?? 0}</dd>
        </div>
      ))}
    </dl>
  );
}

// Section 3: delete an account. Look it up by phone number; the preview
// shows who it is (first name and last 3 digits) and what would be removed,
// or which jobs stop it. Deleting goes through a confirm step that shows the
// counts again, and uses the id from the preview.
function DeleteAccount({ secret }) {
  const [phone, setPhone] = useState('');
  const [preview, setPreview] = useState(null);
  const [checking, setChecking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const check = async e => {
    e.preventDefault();
    setError('');
    setDone('');
    setPreview(null);
    setChecking(true);
    try {
      setPreview(await adminApi('/api/admin/users/deletion/preview', secret, { method: 'POST', body: JSON.stringify({ phone }) }));
    } catch (err) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  };

  const remove = async () => {
    setError('');
    setDeleting(true);
    try {
      await adminApi('/api/admin/users/deletion/delete', secret, { method: 'POST', body: JSON.stringify({ userId: preview.user._id }) });
      setDone(`The account of ${preview.user.firstName} (number ending ${preview.user.phoneEnding}) is deleted.`);
      setPreview(null);
      setPhone('');
      setConfirming(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const who = preview && `${preview.user.firstName} · ${preview.user.role} · ${areaLabel(preview.user.area)} · number ending ${preview.user.phoneEnding}`;
  const blocked = preview?.blockers.length > 0;
  return (
    <section className="mt-10">
      <h2 className="text-section text-ink mb-1">Delete an account</h2>
      <p className="text-body text-muted mb-4">
        Removes the person, their ratings, trust links, offers and pending codes. Jobs where money was paid out or refunded stay for the other person, without them.
      </p>
      <form onSubmit={check} className="flex flex-wrap items-end gap-3">
        <FormField label="Phone number" className="flex-1 min-w-[220px]">
          {field => <TextInput {...field} type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={e => setPhone(e.target.value)} placeholder="0788 123 456" required />}
        </FormField>
        <Button type="submit" size="md" variant="outline" className="h-[54px]" disabled={checking || !phone}>{checking ? 'Checking…' : 'Check'}</Button>
      </form>
      {done && <p className="text-body text-heading bg-mint rounded-field px-4 py-3 mt-4" role="status">{done}</p>}
      {error && !confirming && <p className="text-body text-danger mt-4" role="alert">{error}</p>}

      {preview && (
        <Card className="p-5 mt-4">
          <h3 className="text-card text-ink">{who}</h3>
          {blocked ? (
            <>
              <p className="text-body text-danger mt-2" role="alert">This account can't be deleted yet. Settle these jobs first:</p>
              <ul className="mt-2 grid gap-1">
                {preview.blockers.map(b => <li key={b.jobId} className="text-body text-ink">Job {String(b.jobId).slice(-6)}: {b.reason}</li>)}
              </ul>
            </>
          ) : (
            <>
              <p className="text-body text-muted mt-1">Deleting would remove or change:</p>
              <DeletionCounts counts={preview.counts} />
              <Button className="mt-5" variant="dark" onClick={() => setConfirming(true)}>Delete account</Button>
            </>
          )}
        </Card>
      )}

      <Sheet open={confirming} title="Delete this account?" onClose={() => !deleting && setConfirming(false)}>
        {preview && (
          <div className="space-y-4">
            <p className="text-body text-ink">{who}</p>
            <DeletionCounts counts={preview.counts} />
            <p className="text-body text-muted">This cannot be undone.</p>
            {error && <p className="text-small text-danger" role="alert">{error}</p>}
            <Button onClick={remove} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete account'}</Button>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={deleting}>Cancel</Button>
          </div>
        )}
      </Sheet>
    </section>
  );
}
