// /api/payments (MoMo callback) and /api/admin (dispute resolution, ledger).
import express from 'express';
import mongoose from 'mongoose';
import Job from '../jobs/job.model.js';
import Transaction from './transaction.model.js';
import { HttpError } from '../httpError.js';
import { resolveDispute, syncByRef } from './escrow.js';
import { serverError } from '../serverError.js';
import { requireAdmin } from '../adminAuth.js';

const handle = fn => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    serverError(res, err, req);
  }
};

// POST|PUT /api/payments/momo/callback?ref=<X-Reference-Id> — MoMo calls this
// when a payment or payout finishes. Unauthenticated, so the body is ignored:
// the status is fetched from the provider (escrow.syncByRef), which makes a
// forged or repeated callback harmless. Always answers 200.
export const callbackRouter = express.Router();
callbackRouter.all('/momo/callback', async (req, res) => {
  if (!['POST', 'PUT'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  const ref = typeof req.query.ref === 'string' ? req.query.ref : '';
  if (/^[0-9a-f-]{36}$/i.test(ref)) await syncByRef(ref).catch(() => null);
  res.json({ ok: true });
});

// Admin routes for dispute resolution (FR-14), protected by a shared secret
// in the X-Admin-Secret header (ADMIN_SECRET env var). Off when it is unset.
export const adminRouter = express.Router();
adminRouter.use(requireAdmin);

// GET /api/admin/disputes — disputed jobs with their escrow state, what the
// job was, and what was reported (reason, description, by the client or the
// worker), so the admin can choose release or refund. Ids only, no names or phones.
const DISPUTE_FIELDS = 'status escrow agreedPrice disputedAt disputedBy disputeReason disputeDetails client worker description category area';
adminRouter.get('/disputes', handle(async (_req, res) => {
  const jobs = await Job.find({ status: 'disputed' }, DISPUTE_FIELDS).sort({ disputedAt: 1 }).lean();
  res.json(jobs.map(job => ({
    ...job,
    reportedBy: !job.disputedBy ? null : String(job.disputedBy) === String(job.worker) ? 'worker' : 'client'
  })));
}));

// GET /api/admin/jobs/:id/ledger — every escrow record for the job, oldest first.
adminRouter.get('/jobs/:id/ledger', handle(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Job not found');
  res.json(await Transaction.find({ job: req.params.id }).sort({ createdAt: 1, _id: 1 }).lean());
}));

// POST /api/admin/jobs/:id/{release,refund} — settle a dispute: pay the worker or repay the client.
for (const outcome of ['release', 'refund']) {
  adminRouter.post(`/jobs/:id/${outcome}`, handle(async (req, res) => {
    const job = await resolveDispute(req.params.id, outcome);
    res.status(job.escrow.pending ? 202 : 200).json(job);
  }));
}
