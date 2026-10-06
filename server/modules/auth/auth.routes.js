import express from 'express';
import User from '../users/user.model.js';

const router = express.Router();

// POST /api/auth/login  Body: { phone }
// Demo-grade auth: looks the phone number up against seeded users and returns
// the user (including role) so the client can route by role. No password,
// no session token — not production security.
router.post('/login', async (req, res) => {
  try {
    const phone = String(req.body.phone || '').replace(/\s+/g, '');
    if (!phone) return res.status(400).json({ error: 'phone is required' });

    const user = await User.findOne({ phone }).lean();
    if (!user) return res.status(404).json({ error: 'No account with that phone number' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
