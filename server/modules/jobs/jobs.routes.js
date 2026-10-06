import express from 'express';
import mongoose from 'mongoose';
import User from '../users/user.model.js';
import Job from './job.model.js';
import Quote from './quote.model.js';
import { requireUser, requireRole } from '../auth/currentUser.js';
import { rankByTrust } from '../trust/trustPropagation.js';
import { HttpError, respond, selectResponse, transition } from './lifecycle.js';

const router = express.Router();
router.use(requireUser);

// Wraps async handlers so HttpErrors become JSON responses.
const handle = fn => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
};

const tierById = ranked => new Map(ranked.map(u => [String(u._id), u.trustSource]));

// POST /api/jobs — client posts a job with a proposed price (FR-04).
router.post('/', requireRole('client'), handle(async (req, res) => {
  const { category, description, area, proposedPrice } = req.body;
  const job = await Job.create({ client: req.user._id, category, description, area, proposedPrice });
  // Workers whose "Open jobs near you" list now includes this job.
  const matchingWorkers = await User.find({ role: 'worker', skills: category, area }, 'name').lean();
  res.status(201).json({ ...job.toObject(), matchingWorkers });
}));

// GET /api/jobs/feed — worker: open jobs matching their skills and area, each
// with the client's trust tier from the worker's point of view (Section 3.2.3)
// and the worker's own response if they already sent one.
router.get('/feed', requireRole('worker'), handle(async (req, res) => {
  const jobs = await Job.find({ status: 'open', area: req.user.area, category: { $in: req.user.skills || [] } })
    .sort({ createdAt: -1 })
    .populate('client', 'name area verifiedStatus')
    .lean();

  const clients = [...new Map(jobs.map(j => [String(j.client._id), j.client])).values()];
  const clientTier = tierById(await rankByTrust(req.user._id, clients));
  const myQuotes = await Quote.find({ worker: req.user._id, job: { $in: jobs.map(j => j._id) } }).lean();
  const myQuoteByJob = new Map(myQuotes.map(q => [String(q.job), q]));

  res.json(jobs.map(job => ({
    ...job,
    clientTrust: clientTier.get(String(job.client._id)),
    myResponse: myQuoteByJob.get(String(job._id)) || null
  })));
}));

// GET /api/jobs/mine — client: jobs they posted; worker: jobs assigned to them.
router.get('/mine', handle(async (req, res) => {
  const filter = req.user.role === 'client' ? { client: req.user._id } : { worker: req.user._id };
  const jobs = await Job.find(filter)
    .sort({ createdAt: -1 })
    .populate('client', 'name')
    .populate('worker', 'name')
    .lean();

  const counts = await Quote.aggregate([
    { $match: { job: { $in: jobs.map(j => j._id) } } },
    { $group: { _id: '$job', n: { $sum: 1 } } }
  ]);
  const countByJob = new Map(counts.map(c => [String(c._id), c.n]));
  res.json(jobs.map(job => ({ ...job, responseCount: countByJob.get(String(job._id)) || 0 })));
}));

// GET /api/jobs/:id — the job; for its client, every response ranked by trust
// (FR-05b); for a worker, their own response.
router.get('/:id', handle(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Job not found');
  const job = await Job.findById(req.params.id)
    .populate('client', 'name area verifiedStatus')
    .populate('worker', 'name area')
    .lean();
  if (!job) throw new HttpError(404, 'Job not found');

  if (String(job.client._id) === String(req.user._id)) {
    const quotes = await Quote.find({ job: job._id }).populate('worker', 'name area skills verifiedStatus').lean();
    const quoteByWorker = new Map(quotes.map(q => [String(q.worker._id), q]));
    const rankedWorkers = await rankByTrust(req.user._id, quotes.map(q => q.worker));
    const responses = rankedWorkers.map(w => ({
      ...quoteByWorker.get(String(w._id)),
      trustSource: w.trustSource
    }));
    return res.json({ ...job, responses });
  }

  const myResponse = await Quote.findOne({ job: job._id, worker: req.user._id }).lean();
  res.json({ ...job, myResponse });
}));

// POST /api/jobs/:id/responses — worker accepts the price or counters (FR-05).
// Body: { amount?, depositAmount? }; omitting amount accepts the proposed price.
router.post('/:id/responses', requireRole('worker'), handle(async (req, res) => {
  res.status(201).json(await respond(req.params.id, req.user, req.body));
}));

// POST /api/jobs/:id/select — client picks one response (FR-05b). Body: { quoteId }
router.post('/:id/select', requireRole('client'), handle(async (req, res) => {
  res.json(await selectResponse(req.params.id, req.body.quoteId, req.user));
}));

// POST /api/jobs/:id/{start,complete,confirm,dispute} — lifecycle moves (FR-11, FR-12, FR-14).
for (const action of ['start', 'complete', 'confirm', 'dispute']) {
  router.post(`/:id/${action}`, handle(async (req, res) => {
    res.json(await transition(req.params.id, action, req.user));
  }));
}

export default router;
