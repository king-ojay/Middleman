import express from 'express';
import mongoose from 'mongoose';
import User from '../users/user.model.js';
import Job from './job.model.js';
import Quote from './quote.model.js';
import { FEED_LIMIT, feedQuery } from './feed.js';
import { requireUser, requireRole } from '../auth/currentUser.js';
import { rankByTrust } from '../trust/trustPropagation.js';
import Rating from '../trust/rating.model.js';
import { HttpError, confirmAndRate, dispute, rateClient, respond, selectResponse, transition } from './lifecycle.js';
import { fund, sync } from '../payments/escrow.js';

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

// GET /api/jobs/feed — worker: open jobs to browse (filters in feed.js; the
// default is their own area and trades), each with the client's trust tier
// from the worker's point of view (Section 3.2.3), the worker's own response
// if they already sent one, and whether they may respond (own trades only).
// Only what the card shows leaves the server: no phone numbers, verification,
// referrer or other personal data of the client.
router.get('/feed', requireRole('worker'), handle(async (req, res) => {
  const { filter, sort } = feedQuery(req.user, req.query);
  const jobs = await Job.find(filter, 'category description area proposedPrice status createdAt client')
    .sort(sort)
    .limit(FEED_LIMIT)
    // verifiedStatus feeds the trust fallback only; it is not sent.
    .populate('client', 'name area verifiedStatus')
    .lean();

  const clients = [...new Map(jobs.map(j => [String(j.client._id), j.client])).values()];
  const clientTier = tierById(await rankByTrust(req.user._id, clients));
  const myQuotes = await Quote.find({ worker: req.user._id, job: { $in: jobs.map(j => j._id) } }, 'job amount isCounter depositAmount').lean();
  const myQuoteByJob = new Map(myQuotes.map(q => [String(q.job), q]));
  const skills = new Set(req.user.skills || []);

  res.json(jobs.map(job => ({
    _id: job._id,
    category: job.category,
    description: job.description,
    area: job.area,
    proposedPrice: job.proposedPrice,
    status: job.status,
    createdAt: job.createdAt,
    client: { _id: job.client._id, name: job.client.name, area: job.client.area },
    clientTrust: clientTier.get(String(job.client._id)),
    myResponse: myQuoteByJob.get(String(job._id)) || null,
    canRespond: skills.has(job.category)
  })));
}));

// GET /api/jobs/mine — client: jobs they posted; worker: jobs assigned to them;
// each with its number of responses and whether this user has rated it.
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
  // Whether this user has already rated each job, so the list can offer "Rate".
  const rated = new Set((await Rating.find({ fromUser: req.user._id, job: { $in: jobs.map(j => j._id) } }, 'job').lean()).map(r => String(r.job)));
  res.json(jobs.map(job => ({ ...job, responseCount: countByJob.get(String(job._id)) || 0, rated: rated.has(String(job._id)) })));
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
    const myRating = await Rating.findOne({ job: job._id, fromUser: req.user._id }).lean();
    return res.json({ ...job, responses, myRating });
  }

  const myResponse = await Quote.findOne({ job: job._id, worker: req.user._id }).lean();
  const myRating = await Rating.findOne({ job: job._id, fromUser: req.user._id }).lean();
  res.json({ ...job, myResponse, myRating });
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

// POST /api/jobs/:id/fund — client pays the agreed price into escrow (FR-09).
// 200 once settled (escrow.status held, or none if the payer declined), 202
// while the payment waits for approval (then poll /escrow/sync).
router.post('/:id/fund', requireRole('client'), handle(async (req, res) => {
  const job = await fund(req.params.id, req.user);
  res.status(job.escrow.pending ? 202 : 200).json(job);
}));

// POST /api/jobs/:id/escrow/sync — either party: check a payment or payout in
// flight with the provider (the fallback when no callback arrives).
router.post('/:id/escrow/sync', handle(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Job not found');
  const job = await Job.findOne({ _id: req.params.id, $or: [{ client: req.user._id }, { worker: req.user._id }] }, '_id').lean();
  if (!job) throw new HttpError(404, 'Job not found');
  res.json(await sync(job._id));
}));

// POST /api/jobs/:id/confirm — client confirms, which releases escrow to the
// worker, and rates the worker in the same request (FR-12, FR-13, FR-17).
// Body: { score, referred?, comment? }. 200 { job, myRating } when paid and
// rated; 202 { job, myRating: null } while the payout is in flight.
router.post('/:id/confirm', requireRole('client'), handle(async (req, res) => {
  const result = await confirmAndRate(req.params.id, req.user, req.body);
  res.status(result.myRating ? 200 : 202).json(result);
}));

// POST /api/jobs/:id/rate-client — worker rates the client (FR-12b).
// Body: { score, comment? }
router.post('/:id/rate-client', requireRole('worker'), handle(async (req, res) => {
  res.status(201).json(await rateClient(req.params.id, req.user, req.body));
}));

// POST /api/jobs/:id/{start,complete} — lifecycle moves (FR-11).
for (const action of ['start', 'complete']) {
  router.post(`/:id/${action}`, handle(async (req, res) => {
    res.json(await transition(req.params.id, action, req.user));
  }));
}

// POST /api/jobs/:id/dispute — either party reports a problem; escrow stays locked (FR-14).
router.post('/:id/dispute', handle(async (req, res) => {
  res.json(await dispute(req.params.id, req.user));
}));

export default router;
