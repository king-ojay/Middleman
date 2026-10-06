import mongoose from 'mongoose';
import User from '../users/user.model.js';

// Demo-grade identity: the client sends the logged-in user's id in an
// `x-user-id` header and we trust it. Phase 7 replaces this with PIN login.
export async function requireUser(req, res, next) {
  try {
    const id = req.get('x-user-id');
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(401).json({ error: 'Please log in first' });
    }
    const user = await User.findById(id).lean();
    if (!user) return res.status(401).json({ error: 'Please log in first' });
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ error: `Only ${role}s can do this` });
    }
    next();
  };
}
