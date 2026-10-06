import User from '../users/user.model.js';
import { verifySessionToken } from './session.js';

const unauthorised = res => res.status(401).json({ error: 'Please log in again' });

// Requires "Authorization: Bearer <session token>" from login/registration.
// The token must be correctly signed, unexpired, and from the user's current
// session version (a PIN reset ends older sessions).
export async function requireUser(req, res, next) {
  try {
    const [scheme, token] = (req.get('authorization') || '').split(' ');
    const session = scheme === 'Bearer' ? verifySessionToken(token) : null;
    if (!session) return unauthorised(res);

    const user = await User.findById(session.sub).select('+sessionVersion').lean();
    if (!user || (user.sessionVersion ?? 0) !== session.ver) return unauthorised(res);

    delete user.sessionVersion;
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'CastError') return unauthorised(res);
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
