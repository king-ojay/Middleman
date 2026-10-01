import express from 'express';
import Rating from '../models/Rating.js';
import { writeTrustEdgeFromRating } from '../services/trustPropagation.js';

const router = express.Router();

// POST /api/ratings
// Body: { jobId, fromUser, toUser, score, referredFlag?, comment? }
// Used for BOTH directions: client rating worker (at payment-release), and
// worker rating client (independently, on marking the job complete).
router.post('/', async (req, res) => {
  try {
    const { jobId, fromUser, toUser, score, referredFlag, comment } = req.body;
    const rating = await Rating.create({
      job: jobId, fromUser, toUser, score, referredFlag: !!referredFlag, comment: comment || ''
    });
    await writeTrustEdgeFromRating({ fromUser, toUser, score, referredFlag });
    res.status(201).json(rating);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
