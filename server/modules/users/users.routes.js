import express from 'express';
import mongoose from 'mongoose';
import User from './user.model.js';
import Job from '../jobs/job.model.js';
import Rating from '../trust/rating.model.js';
import TrustEdge from '../trust/trustEdge.model.js';
import { rankByTrust } from '../trust/trustPropagation.js';
import { requireUser } from '../auth/currentUser.js';

const router = express.Router();

// "Amina Uwimana" -> "Amina U." for lists other people see (NFR-05).
const shortName = name => {
  const [first, ...rest] = String(name || '').trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
};

const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// GET /api/users/search?q=ami — "Who invited you?" at signup (FR-03). Public,
// because the person isn't registered yet, so it returns only name, role and
// area (never phone numbers), needs 2+ characters and caps at 5 results.
router.get('/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json([]);
    const users = await User.find({ name: new RegExp(escapeRegex(q), 'i') }, 'name role area')
      .sort({ name: 1 })
      .limit(5)
      .lean();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

export default router;
