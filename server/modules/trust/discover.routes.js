import express from 'express';
import User from '../users/user.model.js';
import { rankByTrust } from './trustPropagation.js';
import { requireUser } from '../auth/currentUser.js';
import { serverError } from '../serverError.js';

const router = express.Router();

// GET /api/discover?category=electrician&area=kimironko
// Workers ranked by trust from the logged-in user's point of view, with a
// layered fallback for workers the graph can't yet reach (Section 3.2.3).
// The viewer always comes from the session, never from the query string.
router.get('/', requireUser, async (req, res) => {
  try {
    const { category, area } = req.query;
    if (!category) return res.status(400).json({ error: 'category is required' });

    const candidates = await User.find({
      role: 'worker',
      skills: category,
      ...(area ? { area } : {})
    }).lean();

    // Order, tier and what the Discover card shows, including whether the
    // worker is verified (the "Verified" badge). The numeric score, phone
    // numbers, referrer, who verified them and when, and timestamps never go
    // to other users.
    const ranked = await rankByTrust(req.user._id, candidates);
    res.json(ranked.map(w => ({
      _id: w._id, name: w.name, skills: w.skills, area: w.area, trustSource: w.trustSource, verified: w.verifiedStatus === 'verified'
    })));
  } catch (err) {
    serverError(res, err, req);
  }
});

export default router;
