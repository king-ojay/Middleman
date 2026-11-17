import { formatRwf } from './format.js';
import { deletedUser } from './greeting.js';
import { getLang, t } from './i18n/index.js';

// Words for a row on the Transactions page (server/modules/payments/
// transactions.routes.js). No colour carries meaning on its own: the status
// is always written out. Words: i18n "tx.*".

const TYPES = ['paid_in', 'released', 'received', 'refunded'];
export const TYPE_LABELS = Object.defineProperties({}, Object.fromEntries(TYPES.map(k => [k, { get: () => t(`tx.type.${k}`), enumerable: true }])));

// tone: Badge tone. `held` is still waiting for the job to finish.
const STATUS_TONES = { pending: 'soft', held: 'action', completed: 'trust', refunded: 'soft', failed: 'problem' };
export const STATUS = Object.fromEntries(Object.entries(STATUS_TONES).map(([key, tone]) => [key, { tone, get label() { return t(`tx.status.${key}`); } }]));

// "−15,000 RWF" leaving you, "+15,000 RWF" reaching you, plain when it moves
// from escrow to the worker. A payment that failed or is still pending moved
// nothing, so it gets no sign.
export function amountLabel({ amount, direction, status }) {
  const sign = status === 'failed' || status === 'pending' ? '' : { out: '−', in: '+' }[direction] || '';
  return `${sign}${formatRwf(amount)}`;
}

// The parts of a date in Kigali time, for the Kinyarwanda labels below
// (browsers don't all carry Kinyarwanda month names).
const kigali = at => Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Africa/Kigali'
}).formatToParts(new Date(at)).map(p => [p.type, p.value]));
const monthName = p => t(`month.${Number(p.month)}`);

// "13 Nov 2026, 14:05" in Kigali time ("13 Ugushyingo 2026, 14:05").
export const dateTimeLabel = at => {
  if (getLang() !== 'en') { const p = kigali(at); return `${p.day} ${monthName(p)} ${p.year}, ${p.hour}:${p.minute}`; }
  return new Date(at).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kigali'
  });
};

// "with Walter N." for a client's row, "from Clara M." for a worker's;
// "Deleted user" when that person has deleted their account.
export function otherLabel({ type, other }) {
  return t(type === 'received' ? 'tx.from' : 'tx.with', { name: other || deletedUser() });
}

// One card per job on the Transactions page. A job's state comes from its
// newest movement that didn't fail; failed attempts stay listed under it.
//   label: the status pill; tone: its Badge tone;
//   steps: the three-step bar; done: how many are complete; bar: its colour
// Step words are i18n keys ("tx.step.*"), read when shown.
const NORMAL_STEPS = ['paidIn', 'held', 'released'];
const REFUND_STEPS = ['paidIn', 'problem', 'refunded'];
// A reported problem that ended with the money released: the dispute stays visible.
const DISPUTE_RELEASED_STEPS = ['paidIn', 'problem', 'released'];
const words = keys => keys.map(k => t(`tx.step.${k}`));

const STATE_SHAPES = {
  pending: { tone: 'soft', steps: NORMAL_STEPS, done: 0, bar: 'ink' },
  held: { tone: 'ink', steps: NORMAL_STEPS, done: 2, bar: 'ink' },
  releasing: { tone: 'soft', steps: NORMAL_STEPS, done: 2, bar: 'ink' },
  released: { tone: 'trust', steps: NORMAL_STEPS, done: 3, bar: 'green' },
  refunding: { tone: 'soft', steps: REFUND_STEPS, done: 2, bar: 'grey' },
  refunded: { tone: 'white', steps: REFUND_STEPS, done: 3, bar: 'grey' },
  failed: { tone: 'problem', steps: NORMAL_STEPS, done: 0, bar: 'grey' }
};
export const JOB_STATES = Object.fromEntries(Object.entries(STATE_SHAPES).map(([key, shape]) => [key, {
  ...shape,
  get label() { return t(`tx.state.${key}`); },
  get steps() { return words(shape.steps); }
}]));

// (row type, row status) -> job state
const STATE_OF = {
  paid_in: { pending: 'pending', held: 'held', completed: 'released', refunded: 'refunded' },
  released: { pending: 'releasing', completed: 'released' },
  received: { pending: 'releasing', completed: 'released' },
  refunded: { pending: 'refunding', refunded: 'refunded' }
};

export function jobState(rows) {
  const newest = rows.find(r => r.status !== 'failed');
  return newest ? STATE_OF[newest.type]?.[newest.status] || 'pending' : 'failed';
}

// The three steps on a card: a released job that had a problem reported
// shows it in the middle step, green like any released job.
export function stepsFor(card) {
  const state = JOB_STATES[card.state];
  const { label, steps, tone, done, bar } = state;
  if (card.state === 'released' && card.job.disputed) return { label, tone, done, bar, steps: words(DISPUTE_RELEASED_STEPS) };
  return { label, steps, tone, done, bar };
}

// The pill's words: a worker's released money is "Received"; money the
// system released after the confirmation window (FR-13) is "Released
// automatically" for both.
export function stateLabel(state, role, automatic = false) {
  if (state === 'released' && automatic) return t('tx.state.auto');
  return state === 'released' && role === 'worker' ? t('tx.state.received') : JOB_STATES[state].label;
}

// "Payment releases automatically on 18 Nov 2026, 14:05 unless you confirm or
// report a problem." for the client; the worker's says "the client".
export function autoReleaseNote(at, role) {
  return t(role === 'client' ? 'job.autoRelease.client' : 'job.autoRelease.worker', { date: dateTimeLabel(at) });
}

// "To Walter N." on a client's card, "From Clara M." on a worker's.
export const counterpartLabel = (other, role) => t(role === 'worker' ? 'tx.fromCap' : 'tx.to', { name: other || deletedUser() });

// "13 Nov" in Kigali time ("13 Ugushyingo").
export const shortDate = at => {
  if (getLang() !== 'en') { const p = kigali(at); return `${p.day} ${monthName(p)}`; }
  return new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Kigali' });
};

// "November 2026" in Kigali time ("Ugushyingo 2026").
export const monthLabel = at => {
  if (getLang() !== 'en') { const p = kigali(at); return `${monthName(p)} ${p.year}`; }
  return new Date(at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Africa/Kigali' });
};

/**
 * Rows (newest first, as the server sends them, across loaded pages) to
 * months of job cards: [{ month, jobs: [{ job, other, at, rows, state, main,
 * failed }] }]. `main` is the movement whose amount the card shows; `failed`
 * lists the failed attempts when something else went through.
 */
export function groupTransactions(rows) {
  const byJob = new Map();
  for (const row of rows) {
    const key = String(row.job._id);
    if (!byJob.has(key)) byJob.set(key, []);
    byJob.get(key).push(row);
  }
  const months = new Map();
  for (const jobRows of byJob.values()) {
    const state = jobState(jobRows);
    const main = jobRows.find(r => r.status !== 'failed') || jobRows[0];
    const card = {
      job: jobRows[0].job,
      other: jobRows[0].other,
      at: jobRows[0].at,
      rows: jobRows,
      state,
      main,
      failed: state === 'failed' ? [] : jobRows.filter(r => r.status === 'failed')
    };
    const month = monthLabel(card.at);
    if (!months.has(month)) months.set(month, []);
    months.get(month).push(card);
  }
  return [...months].map(([month, jobs]) => ({ month, jobs }));
}
