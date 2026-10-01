import express from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import TrustEdge from '../models/TrustEdge.js';
import { computeTrustScores } from '../services/trustPropagation.js';

const router = express.Router();

// Area-level trust is second-hand community opinion, not a path through the
// client's own network, so it's discounted relative to the edge weights it
// averages.
const AREA_DISCOUNT = 0.5;

// Layered fallback order from Section 3.2.3: graph path -> area -> verification floor.
const TIER_RANK = { network: 0, area: 1, fallback: 2 };

/**
 * Area-level community trust for workers the client's graph can't reach:
 * the average weight of rating edges a worker has received from users in
 * the worker's own area. Workers with no such ratings get no entry.
 */
async function computeAreaScores(workers) {
  if (workers.length === 0) return new Map();
  const areaByWorker = new Map(workers.map(w => [String(w._id), w.area]));

  const edges = await TrustEdge.find({
    toUser: { $in: workers.map(w => w._id) },
    type: 'rating'
  }).populate('fromUser', 'area').lean();

  const sums = new Map(); // workerId -> { total, count }
  for (const edge of edges) {
    const workerId = String(edge.toUser);
    if (edge.fromUser?.area !== areaByWorker.get(workerId)) continue;
    const acc = sums.get(workerId) || { total: 0, count: 0 };
    acc.total += edge.weight;
    acc.count += 1;
    sums.set(workerId, acc);
  }

  const scores = new Map();
  for (const [workerId, { total, count }] of sums) {
    scores.set(workerId, (total / count) * AREA_DISCOUNT);
  }
  return scores;
}

// GET /api/discover?clientId=...&category=electrician&area=kimironko
// Returns workers ranked by personalised trust score, with a layered fallback
// for workers the graph can't yet reach (cold-start — see Section 3.2.3).
router.get('/', async (req, res) => {
  try {
    const { clientId, category, area } = req.query;
    if (!clientId || !category) {
      return res.status(400).json({ error: 'clientId and category are required' });
    }
    if (!mongoose.isValidObjectId(clientId)) {
      return res.status(400).json({ error: 'clientId is not a valid id' });
    }

    const candidates = await User.find({
      role: 'worker',
      skills: category,
      ...(area ? { area } : {})
    }).lean();

    const scores = await computeTrustScores(clientId);
    const unreached = candidates.filter(w => !scores.has(String(w._id)));
    const areaScores = await computeAreaScores(unreached);

    const ranked = candidates.map(worker => {
      const id = String(worker._id);
      if (scores.has(id)) {
        return { ...worker, trustScore: scores.get(id), trustSource: 'network' };
      }
      if (areaScores.has(id)) {
        return { ...worker, trustScore: areaScores.get(id), trustSource: 'area' };
      }
      // Final fallback: verified workers get a modest floor score,
      // unverified workers get the lowest floor.
      const floor = worker.verifiedStatus === 'verified' ? 0.3 : 0.1;
      return { ...worker, trustScore: floor, trustSource: 'fallback' };
    });

    ranked.sort((a, b) =>
      TIER_RANK[a.trustSource] - TIER_RANK[b.trustSource] || b.trustScore - a.trustScore
    );
    res.json(ranked);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
