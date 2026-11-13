import { formatRwf } from './format.js';

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
  completed: { label: 'Completed', tone: 'mint' },
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

// "with Walter N." for a client's row, "from Clara M." for a worker's.
export function otherLabel({ type, other }) {
  if (!other) return 'with a removed account';
  return `${type === 'received' ? 'from' : 'with'} ${other}`;
}
