import User from '../users/user.model.js';
import { verifySessionToken } from './session.js';
import { POLICY_VERSION } from '../../config/policy.shared.js';

const unauthorised = res => res.status(401).json({ error: 'Please log in again' });

export const CONSENT_REQUIRED = 'Agree to the current Privacy Policy & Terms to continue';

/** True when the user has agreed to the current policy and confirmed they are 18 or older. */
export const hasConsent = user => user?.policyVersion === POLICY_VERSION && user?.ageConfirmed === true;

// Requires "Authorization: Bearer <session token>" from login/registration.
// The token must be correctly signed, unexpired, and from the user's current
// session version (a PIN reset ends older sessions). This alone is enough
// for recording consent (POST /api/auth/consent).
export async function requireSession(req, res, next) {
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

// requireSession, and the user must have agreed to the current Privacy
// Policy & Terms (POLICY_VERSION) and confirmed they are 18 or older. Accounts
// from before consent was asked for, or from an older policy, get 403 with
// code consent_required until they agree (the app shows its consent screen).
// Every logged-in API route uses this; auth routes (login, sign-up, codes,
// PIN reset, consent) don't, and logging out is the app forgetting its token.
export function requireUser(req, res, next) {
  requireSession(req, res, err => {
    if (err) return next(err);
    if (!hasConsent(req.user)) return res.status(403).json({ error: CONSENT_REQUIRED, code: 'consent_required' });
    next();
  });
}

export function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ error: `Only ${role}s can do this` });
    }
    next();
  };
}
