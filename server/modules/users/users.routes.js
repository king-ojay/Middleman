// /api/users: inviter lookup at signup, profiles, and changing your own area.
import express from 'express';
import mongoose from 'mongoose';
import User from './user.model.js';
import Job from '../jobs/job.model.js';
import Rating from '../trust/rating.model.js';
import TrustEdge from '../trust/trustEdge.model.js';
import { rankByTrust } from '../trust/trustPropagation.js';
import { requireUser } from '../auth/currentUser.js';
import { hit } from '../auth/rateLimit.js';
import { normalisePhone } from './phone.js';
import { AREAS } from '../../config/areas.js';
import { serverError } from '../serverError.js';

const router = express.Router();

// "Amina Uwimana" -> "Amina U." for lists other people see (NFR-05).
const shortName = name => {
  const [first, ...rest] = String(name || '').trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
};

// Inviter lookups: 30 per IP per 15 minutes (pilot sessions share one Wi-Fi
// network, so one IP), shared with the register route so it can't be used to
// get round the limit.
export const LOOKUP_LIMIT = Object.freeze({ perIp: 30, windowMs: 15 * 60 * 1000 });
export const LOOKUP_NOT_FOUND = "We couldn't find that phone number. Check it or skip this step.";
export const LOOKUP_LIMITED = 'Too many lookups. Please wait 15 minutes and try again.';
export const lookupAllowed = req => hit(`lookup:ip:${req.ip}`, LOOKUP_LIMIT.perIp, LOOKUP_LIMIT.windowMs).allowed;

// POST /api/users/lookup  Body: { phone } — "Who invited you?" at signup
// (FR-03). Public, because the person isn't registered yet. Exact match on a
// complete phone number only (no partial or name matching, never a list), so
// nobody can browse members. Returns just enough to confirm the right person:
// short name, area, role and the last 3 digits — never the full number or id.
// The number travels in the body, so it stays out of URLs and request logs.
router.post('/lookup', async (req, res) => {
  try {
    if (!lookupAllowed(req)) return res.status(429).json({ error: LOOKUP_LIMITED });
    const phone = normalisePhone(req.body?.phone);
    if (!phone) return res.status(400).json({ error: 'Enter the full phone number, e.g. 0788 123 456' });
    const user = await User.findOne({ phone }, 'name role area').lean();
    if (!user) return res.status(404).json({ error: LOOKUP_NOT_FOUND });
    res.json({ name: shortName(user.name), area: user.area, role: user.role, phoneEnding: phone.slice(-3) });
  } catch (err) {
    serverError(res, err, req);
  }
});

// PATCH /api/users/me  Body: { area } — change your own area (Profile). Only
// the area can be changed here, and only to a pilot area (shared/areas.js).
// It takes effect at once: area trust, Discover and the job list read the
// area from the database on every request.
router.patch('/me', requireUser, async (req, res) => {
  try {
    const { area } = req.body || {};
    if (!AREAS.includes(area)) return res.status(400).json({ error: 'Choose your area' });
    const user = await User.findByIdAndUpdate(req.user._id, { area }, { new: true, runValidators: true }).lean();
    if (!user) return res.status(401).json({ error: 'Please log in again' });
    const { pinHash, sessionVersion, __v, ...rest } = user;
    res.json({ user: rest });
  } catch (err) {
    serverError(res, err, req);
  }
});

// GET /api/users/:id/profile — stats, who vouches for them, recent ratings,
// and (for someone else's profile) their trust tier from the viewer's side.
router.get('/:id/profile', requireUser, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Person not found' });
    const user = await User.findById(req.params.id, 'name role area skills verifiedStatus').lean();
    if (!user) return res.status(404).json({ error: 'Person not found' });

    const roleField = user.role === 'worker' ? 'worker' : 'client';
    const [jobsDone, ratings, referralEdges] = await Promise.all([
      Job.countDocuments({ [roleField]: user._id, status: 'completed' }),
      Rating.find({ toUser: user._id }).sort({ createdAt: -1 }).populate('fromUser', 'name').lean(),
      TrustEdge.find({ toUser: user._id, type: 'signup_referral' }).populate('fromUser', 'name').lean()
    ]);

    // Vouches: completed jobs flagged "referred" (FR-17) and signup invitations (FR-03).
    const vouchers = new Map();
    for (const r of ratings) if (r.referredFlag && r.fromUser) vouchers.set(String(r.fromUser._id), r.fromUser.name);
    for (const e of referralEdges) if (e.fromUser) vouchers.set(String(e.fromUser._id), e.fromUser.name);

    const isSelf = String(user._id) === String(req.user._id);
    const trustSource = isSelf ? null : (await rankByTrust(req.user._id, [user]))[0].trustSource;

    res.json({
      ...user,
      trustSource,
      stats: {
        jobsDone,
        avgRating: ratings.length ? Math.round((ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length) * 10) / 10 : null,
        ratingCount: ratings.length,
        vouches: vouchers.size
      },
      vouchedBy: [...vouchers.values()].map(shortName),
      recentRatings: ratings.slice(0, 5).map(r => ({
        _id: r._id,
        score: r.score,
        comment: r.comment,
        from: shortName(r.fromUser?.name),
        createdAt: r.createdAt
      }))
    });
  } catch (err) {
    serverError(res, err, req);
  }
});

export default router;
