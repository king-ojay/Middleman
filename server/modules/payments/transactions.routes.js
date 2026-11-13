// GET /api/transactions — the signed-in person's own money movements, read
// from the escrow ledger. Only jobs they are the client or the worker on, and
// only the movements that are theirs:
//   client: fund    "Paid into escrow"     (out)
//           release "Released to worker"   (escrow to the worker)
//           refund  "Refunded to you"      (in)
//   worker: release "Received"             (in)
// One row per movement (a requested record and, once settled, its succeeded
// or failed record). Pending and failed attempts are listed as such and never
// counted in the totals. The other person appears by short name only; no
// phone numbers, provider references or other people's ids are sent.
import express from 'express';
import Job from '../jobs/job.model.js';
import Transaction from './transaction.model.js';
import { requireUser } from '../auth/currentUser.js';
import { shortName } from '../users/shortName.js';
import { serverError } from '../serverError.js';

const router = express.Router();

export const PAGE_SIZE = 20;

const TYPES = {
  client: { fund: { type: 'paid_in', direction: 'out' }, release: { type: 'released', direction: 'moved' }, refund: { type: 'refunded', direction: 'in' } },
  worker: { release: { type: 'received', direction: 'in' } }
};

// A payment into escrow that went through shows where the money is now.
const FUNDED = { released: 'completed', refunded: 'refunded' };
const SETTLED = { fund: null, release: 'completed', refund: 'refunded' };

function statusOf(kind, outcome, job) {
  if (!outcome) return 'pending';
  if (outcome === 'failed') return 'failed';
  return SETTLED[kind] || FUNDED[job.escrow?.status] || 'held';
}

/** Every money movement of `userId`'s, newest first, and the totals. */
export async function transactionsOf(userId) {
  const jobs = await Job.find({ $or: [{ client: userId }, { worker: userId }] }, 'client worker category description escrow.status')
    .populate('client', 'name').populate('worker', 'name').lean();
  const byId = new Map(jobs.map(j => [String(j._id), j]));
  const ledger = await Transaction.find({ job: { $in: jobs.map(j => j._id) }, providerRef: { $type: 'string' } }, 'job event amount currency providerRef createdAt')
    .sort({ createdAt: 1, _id: 1 }).lean();

  const movements = new Map(); // providerRef -> row being built
  for (const t of ledger) {
    const [kind, step] = t.event.split('_');
    const job = byId.get(String(t.job));
    const role = String(job.client?._id ?? job.client) === String(userId) ? 'client' : 'worker';
    const shape = TYPES[role][kind];
    if (!shape) continue;
    const row = movements.get(t.providerRef) || { id: String(t._id), job, kind, role, shape, amount: t.amount, currency: t.currency, startedAt: t.createdAt };
    if (step === 'succeeded' || step === 'failed') Object.assign(row, { outcome: step, settledAt: t.createdAt });
    movements.set(t.providerRef, row);
  }

  const rows = [...movements.values()].map(({ id, job, kind, role, shape, amount, currency, startedAt, outcome, settledAt }) => {
    const other = role === 'client' ? job.worker : job.client;
    return {
      id, // the ledger record that started it
      at: settledAt || startedAt,
      ...shape,
      status: statusOf(kind, outcome, job),
      amount,
      currency,
      other: other?.name ? shortName(other.name) : null,
      job: { _id: job._id, category: job.category, description: job.description }
    };
  }).sort((a, b) => new Date(b.at) - new Date(a.at));

  // Money that reached the worker: what the worker earned, what the client paid.
  const done = rows.filter(r => (r.type === 'received' || r.type === 'released') && r.status === 'completed');
  return {
    rows,
    totals: { total: done.reduce((sum, r) => sum + r.amount, 0), jobs: new Set(done.map(r => String(r.job._id))).size }
  };
}

// ?offset=20 for the next page. `totals` cover every row, not just the page.
router.get('/', requireUser, async (req, res) => {
  try {
    const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
    const { rows, totals } = await transactionsOf(req.user._id);
    res.json({
      role: req.user.role,
      totals,
      transactions: rows.slice(offset, offset + PAGE_SIZE),
      nextOffset: offset + PAGE_SIZE < rows.length ? offset + PAGE_SIZE : null
    });
  } catch (err) {
    serverError(res, err, req);
  }
});

export default router;
