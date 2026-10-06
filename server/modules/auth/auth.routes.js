import express from 'express';
import mongoose from 'mongoose';
import User from '../users/user.model.js';
import { normalisePhone } from '../users/phone.js';
import { writeTrustEdgeFromReferral } from '../trust/trustPropagation.js';
import { AREAS } from '../../config/areas.js';
import { CATEGORIES } from '../../config/categories.js';
import { hashPin, isValidPin, verifyPin } from './pin.js';

const router = express.Router();

const publicUser = user => {
  const { pinHash, __v, ...rest } = user.toObject ? user.toObject() : user;
  return rest;
};

// POST /api/auth/login  Body: { phone, pin }
// Returns the user so the client can route by role. One message for any
// failure, so it doesn't reveal which numbers have accounts. The session is
// still the demo-grade x-user-id header until Phase 7.
router.post('/login', async (req, res) => {
  try {
    const phone = normalisePhone(req.body.phone);
    const user = phone ? await User.findOne({ phone }).select('+pinHash') : null;
    if (!user || !(await verifyPin(req.body.pin, user.pinHash))) {
      return res.status(401).json({ error: 'That phone number and PIN do not match' });
    }
    res.json(publicUser(user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/register
// Body: { role, name, phone, area, skills?, pin, referrerId? }   (FR-01, FR-02, FR-03)
// A referrer creates a signup_referral edge from them to the new user: they
// vouch for the person they invited.
router.post('/register', async (req, res) => {
  try {
    const { role, name, area, skills = [], pin, referrerId } = req.body;
    const phone = normalisePhone(req.body.phone);

    if (!['client', 'worker'].includes(role)) return res.status(400).json({ error: 'Choose client or worker' });
    if (!String(name || '').trim()) return res.status(400).json({ error: 'Enter your full name' });
    if (!phone) return res.status(400).json({ error: 'Enter a Rwandan mobile number, e.g. 0788 123 456' });
    if (!AREAS.includes(area)) return res.status(400).json({ error: 'Choose your area' });
    if (role === 'worker' && (!Array.isArray(skills) || skills.length === 0 || !skills.every(s => CATEGORIES.includes(s)))) {
      return res.status(400).json({ error: 'Choose at least one trade' });
    }
    if (!isValidPin(pin)) return res.status(400).json({ error: 'Your PIN must be 4 digits' });

    let referrer = null;
    if (referrerId) {
      if (!mongoose.isValidObjectId(referrerId)) return res.status(400).json({ error: 'Unknown referrer' });
      referrer = await User.findById(referrerId).lean();
      if (!referrer) return res.status(400).json({ error: 'Unknown referrer' });
    }

    if (await User.exists({ phone })) {
      return res.status(409).json({ error: 'An account with this phone number already exists. Log in instead.' });
    }

    const user = await User.create({
      role,
      name: String(name).trim(),
      phone,
      area,
      skills: role === 'worker' ? skills : [],
      pinHash: await hashPin(pin),
      referredBy: referrer?._id ?? null
    });
    if (referrer) await writeTrustEdgeFromReferral({ fromUser: referrer._id, toUser: user._id });

    res.status(201).json(publicUser(user));
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'An account with this phone number already exists. Log in instead.' });
    res.status(500).json({ error: err.message });
  }
});

export default router;
