import { formatRwf } from './format.js';
import { DELETED_USER } from './greeting.js';

// Words for a row on the Transactions page (server/modules/payments/
// transactions.routes.js). No colour carries meaning on its own: the status
// is always written out.

export const TYPE_LABELS = {
  paid_in: 'Paid into escrow',
  released: 'Released to worker',
  received: 'Received',
  refunded: 'Refunded to you'
};

// tone: Badge tone. `held` is still waiting for the job to finish.
export const STATUS = {
  pending: { label: 'Pending', tone: 'soft' },
  held: { label: 'Held', tone: 'action' },
  completed: { label: 'Completed', tone: 'trust' },
  refunded: { label: 'Refunded', tone: 'soft' },
  failed: { label: 'Failed', tone: 'problem' }
};

// "−15,000 RWF" leaving you, "+15,000 RWF" reaching you, plain when it moves
// from escrow to the worker. A payment that failed or is still pending moved
// nothing, so it gets no sign.
export function amountLabel({ amount, direction, status }) {
  const sign = status === 'failed' || status === 'pending' ? '' : { out: '−', in: '+' }[direction] || '';
  return `${sign}${formatRwf(amount)}`;
}

// "13 Nov 2026, 14:05" in Kigali time.
export const dateTimeLabel = at => new Date(at).toLocaleString('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kigali'
});

// "with Walter N." for a client's row, "from Clara M." for a worker's;
// "Deleted user" when that person has deleted their account.
export function otherLabel({ type, other }) {
  return `${type === 'received' ? 'from' : 'with'} ${other || DELETED_USER}`;
}

// One card per job on the Transactions page. A job's state comes from its
// newest movement that didn't fail; failed attempts stay listed under it.
//   label: the status pill; tone: its Badge tone;
//   steps: the three-step bar; done: how many are complete; bar: its colour
const NORMAL_STEPS = ['Paid in', 'Held in escrow', 'Released'];
const REFUND_STEPS = ['Paid in', 'Problem reported', 'Refunded to you'];
// A reported problem that ended with the money released: the dispute stays visible.
const DISPUTE_RELEASED_STEPS = ['Paid in', 'Problem reported', 'Released'];

export const JOB_STATES = {
  pending: { label: 'Pending', tone: 'soft', steps: NORMAL_STEPS, done: 0, bar: 'ink' },
  held: { label: 'In escrow', tone: 'ink', steps: NORMAL_STEPS, done: 2, bar: 'ink' },
  releasing: { label: 'Releasing', tone: 'soft', steps: NORMAL_STEPS, done: 2, bar: 'ink' },
  released: { label: 'Released', tone: 'trust', steps: NORMAL_STEPS, done: 3, bar: 'green' },
  refunding: { label: 'Refund on its way', tone: 'soft', steps: REFUND_STEPS, done: 2, bar: 'grey' },
  refunded: { label: 'Refunded', tone: 'white', steps: REFUND_STEPS, done: 3, bar: 'grey' },
  failed: { label: 'Failed', tone: 'problem', steps: NORMAL_STEPS, done: 0, bar: 'grey' }
};

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
  if (card.state === 'released' && card.job.disputed) return { ...state, steps: DISPUTE_RELEASED_STEPS };
  return state;
}

// The pill's words: a worker's released money is "Received"; money the
// system released after the confirmation window (FR-13) is "Released
// automatically" for both.
export function stateLabel(state, role, automatic = false) {
  if (state === 'released' && automatic) return 'Released automatically';
  return state === 'released' && role === 'worker' ? 'Received' : JOB_STATES[state].label;
}

// "Payment releases automatically on 18 Nov 2026, 14:05 unless you confirm or
// report a problem." for the client; the worker's says "the client".
export function autoReleaseNote(at, role) {
  const who = role === 'client' ? 'you confirm or report' : 'the client confirms or reports';
  return `Payment releases automatically on ${dateTimeLabel(at)} unless ${who} a problem.`;
}

// "To Walter N." on a client's card, "From Clara M." on a worker's.
export const counterpartLabel = (other, role) => `${role === 'worker' ? 'From' : 'To'} ${other || DELETED_USER}`;

// "13 Nov" in Kigali time.
export const shortDate = at => new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Kigali' });

// "November 2026" in Kigali time.
export const monthLabel = at => new Date(at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Africa/Kigali' });

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
