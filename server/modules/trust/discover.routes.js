import express from 'express';
import User from '../users/user.model.js';
import { rankByTrust } from './trustPropagation.js';
import { requireUser } from '../auth/currentUser.js';

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

    // Order and tier only: the numeric score never leaves the server.
    const ranked = await rankByTrust(req.user._id, candidates);
    res.json(ranked.map(({ trustScore, ...worker }) => worker));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
