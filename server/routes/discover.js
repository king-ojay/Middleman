import express from 'express';
import User from '../models/User.js';
import { computeTrustScores } from '../services/trustPropagation.js';

const router = express.Router();

// GET /api/discover?clientId=...&category=electrician&area=kimironko
// Returns workers ranked by personalised trust score, with a fallback for
// workers the graph can't yet reach (cold-start — see Section 3.2.3).
router.get('/', async (req, res) => {
  try {
    const { clientId, category, area } = req.query;
    if (!clientId || !category) {
      return res.status(400).json({ error: 'clientId and category are required' });
    }

    const candidates = await User.find({
      role: 'worker',
      skills: category,
      ...(area ? { area } : {})
    }).lean();

    const scores = await computeTrustScores(clientId);

    const ranked = candidates.map(worker => {
      const graphScore = scores.get(String(worker._id));
      if (graphScore !== undefined) {
        return { ...worker, trustScore: graphScore, trustSource: 'network' };
      }
      // Cold-start fallback: verified workers get a modest floor score,
      // unverified workers get the lowest floor. Area-level community
      // trust (averaging graphScores of other workers in the same area)
      // is the intended next fallback layer — left as a TODO for the
      // synthetic-dataset evaluation phase.
      const floor = worker.verifiedStatus === 'verified' ? 0.3 : 0.1;
      return { ...worker, trustScore: floor, trustSource: 'fallback' };
    });

    ranked.sort((a, b) => b.trustScore - a.trustScore);
    res.json(ranked);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
