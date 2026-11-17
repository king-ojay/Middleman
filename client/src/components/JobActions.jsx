import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { formatRwf } from '../format.js';
import { firstName } from '../greeting.js';
import { t } from '../i18n/index.js';
import { Button, Sheet } from './ui/index.js';
import ReportProblem from './ReportProblem.jsx';

const DISPUTE = { action: 'dispute', label: 'actions.dispute' };

// The next step(s) available to this person for this job (Fig. 5). The
// worker starts only once the client has paid into escrow (FR-09). Labels
// are i18n keys.
const ACTIONS = {
  worker: {
    escrow_held: [{ action: 'start', label: 'actions.start', primary: true }, DISPUTE],
    in_progress: [{ action: 'complete', label: 'actions.complete', primary: true }, DISPUTE]
  },
  client: {
    quote_accepted: [{ action: 'fund', label: 'actions.pay', primary: true }],
    escrow_held: [DISPUTE],
    in_progress: [DISPUTE],
    // Confirming needs a rating (FR-12), so it opens the Confirm & rate screen.
    awaiting_confirmation: [{ to: 'rate', label: 'actions.confirmRate', primary: true }, DISPUTE]
  }
};

// While a payment waits for approval there is nothing to do but check on it.
const CHECK_PAYMENT = [{ action: 'escrow/sync', label: 'actions.checkPayment' }];

// primaryOnly (job cards): just the one next step, no "Report a problem";
// that stays on the job's own page. stalled: the job page has stopped
// checking a pending payment on its own (JobDetail POLL_FOR_MS).
export default function JobActions({ job, role, onChange, primaryOnly = false, stalled = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reporting, setReporting] = useState(false);
  const [paying, setPaying] = useState(false);
  const all = job.escrow?.pending ? CHECK_PAYMENT : ACTIONS[role]?.[job.status] || [];
  const actions = primaryOnly && all !== CHECK_PAYMENT ? all.filter(a => a.primary) : all;
  if (actions.length === 0 && !paying) return null;
  // A payment into escrow that failed, was rejected or expired: the job is
  // back at "Pay into escrow" and escrow.lastFailure says why.
  const paymentFailed = role === 'client' && job.status === 'quote_accepted' && !job.escrow?.pending
    && job.escrow?.lastFailure?.kind === 'fund';

  const run = async action => {
    if (action === 'dispute') return setReporting(true);
    if (action === 'fund') return setPaying(true);
    setError('');
    setBusy(true);
    try {
      await api(`/api/jobs/${job._id}/${action}`, { method: 'POST' });
      onChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={primaryOnly ? 'space-y-3' : 'mt-4 space-y-3'}>
      {paymentFailed && !error && <p className="text-small text-danger" role="alert">{t('actions.paymentFailed')}</p>}
      {stalled && job.escrow?.pending && <p className="text-body text-muted" role="status">{t('actions.stillWaiting')}</p>}
      {actions.map(({ action, to, label, primary }) =>
        to ? (
          <Button key={to} to={`/my-jobs/${job._id}`}>{t(label)}</Button>
        ) : (
          <Button key={action} variant={primary ? 'primary' : primaryOnly ? 'outline' : 'plain'} disabled={busy} onClick={() => run(action)}>
            {t(label)}
          </Button>
        )
      )}
      {error && <p className="text-small text-danger" role="alert">{error}</p>}
      {role === 'client' && <PaySheet job={job} open={paying} onClose={() => { setPaying(false); onChange(); }} />}
      {!primaryOnly && (
        <ReportProblem job={job} role={role} open={reporting} onClose={() => setReporting(false)} onReported={() => { setReporting(false); onChange(); }} />
      )}
    </div>
  );
}

const POLL_EVERY_MS = 5000;
const POLL_FOR_MS = 2 * 60 * 1000;

// Where a payment into escrow stands, from the job the server sends back:
// held, still waiting for the payer's approval, or over without moving money.
const phaseOf = job => (job.escrow?.status === 'held' ? 'held' : job.escrow?.pending ? 'waiting' : 'failed');

// Paying into escrow (FR-09), in place of a browser pop-up: the amount and
// the worker, the note that MTN MoMo asks the payer to approve with their PIN,
// then Pay. While MoMo waits for that approval the sheet checks the payment
// every few seconds (POST /escrow/sync), then says it is held in escrow, or
// that it failed, with Try again. Closing it reloads the job page behind.
function PaySheet({ job, open, onClose }) {
  const [phase, setPhase] = useState('confirm'); // confirm | sending | waiting | stalled | held | failed
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setPhase('confirm'); setError(''); }
  }, [open]);

  const pay = async () => {
    setPhase('sending');
    setError('');
    try {
      setPhase(phaseOf(await api(`/api/jobs/${job._id}/fund`, { method: 'POST' })));
    } catch (err) {
      setError(err.message);
      setPhase('failed');
    }
  };

  useEffect(() => {
    if (phase !== 'waiting') return undefined;
    const started = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - started >= POLL_FOR_MS) {
        clearInterval(timer);
        setPhase('stalled');
        return;
      }
      try {
        const next = phaseOf(await api(`/api/jobs/${job._id}/escrow/sync`, { method: 'POST' }));
        if (next !== 'waiting') { clearInterval(timer); setPhase(next); }
      } catch {
        // can't reach the server this time: keep checking
      }
    }, POLL_EVERY_MS);
    return () => clearInterval(timer);
  }, [phase, job._id]);

  const amount = formatRwf(job.agreedPrice);
  const worker = job.worker?.name;
  return (
    <Sheet open={open} title={t('pay.title')} onClose={() => phase !== 'sending' && onClose()}>
      <div className="space-y-5">
        <dl className="grid grid-cols-2 gap-3">
          <div className="bg-soft rounded-tile p-3 min-w-0">
            <dt className="text-small text-muted">{t('pay.amount')}</dt>
            <dd className="text-card font-bold text-ink whitespace-nowrap">{amount}</dd>
          </div>
          <div className="bg-soft rounded-tile p-3 min-w-0">
            <dt className="text-small text-muted">{t('pay.worker')}</dt>
            <dd className="text-card font-bold text-ink break-words">{worker || t('common.deletedUser')}</dd>
          </div>
        </dl>

        <div role="status" aria-live="polite">
          {(phase === 'confirm' || phase === 'sending') && (
            <>
              <p className="text-body text-ink">{t('pay.held')}</p>
              <p className="text-body text-ink mt-3">{t('pay.momoNote')}</p>
            </>
          )}
          {phase === 'waiting' && (
            <>
              <p className="text-card text-ink">{t('pay.waiting')}</p>
              <p className="text-body text-muted mt-1">{t('pay.waitingNote')}</p>
            </>
          )}
          {phase === 'stalled' && <p className="text-body text-ink">{t('pay.stillWaiting')}</p>}
          {phase === 'held' && (
            <div className="bg-trust text-on-trust rounded-card p-4">
              <p className="text-card">{t('pay.success')}</p>
              <p className="text-body mt-1">{t('pay.successNote', { name: firstName(job.worker) || t('common.deletedUser') })}</p>
            </div>
          )}
        </div>
        {phase === 'failed' && (
          <div role="alert">
            <p className="text-body font-semibold text-danger">{error || t('pay.failed')}</p>
            {!error && <p className="text-body text-muted mt-1">{t('pay.failedNote')}</p>}
          </div>
        )}

        <TestPaymentNotice />

        <div className="space-y-2">
          {(phase === 'confirm' || phase === 'sending') && (
            <Button onClick={pay} disabled={phase === 'sending'} aria-busy={phase === 'sending'}>
              {phase === 'sending' ? t('pay.starting') : t('pay.button', { amount })}
            </Button>
          )}
          {phase === 'failed' && <Button onClick={pay}>{t('common.tryAgain')}</Button>}
          {phase === 'held' && <Button onClick={onClose}>{t('common.done')}</Button>}
          {['confirm', 'failed', 'waiting', 'stalled'].includes(phase) && (
            <Button variant="outline" onClick={onClose}>{phase === 'confirm' || phase === 'failed' ? t('common.cancel') : t('common.close')}</Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}

// "Test payment, no real money moves": on the pay sheet and the Transactions
// page only (the pilot's escrow is the MTN MoMo sandbox or the fake provider).
export function TestPaymentNotice({ className = '' }) {
  return (
    <p role="note" className={`flex items-center gap-2 text-small text-on-warn bg-warn rounded-field px-3 py-2 ${className}`}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
        <circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.01" />
      </svg>
      {t('testPayment.notice')}
    </p>
  );
}
