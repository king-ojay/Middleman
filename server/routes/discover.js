import express from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import { rankByTrust } from '../services/trustPropagation.js';

const router = express.Router();

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

    res.json(await rankByTrust(clientId, candidates));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
