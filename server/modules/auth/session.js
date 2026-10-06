import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Signed session tokens in the standard JWT format (HS256), made with Node's
// crypto so there's no extra dependency. The client sends it as
// "Authorization: Bearer <token>"; the server checks the signature, the expiry
// and the user's sessionVersion on every request.
//
// A header token rather than a cookie: the app (vercel.app) and the API
// (onrender.com) are different sites, so a session cookie would be a
// third-party cookie, which Safari and others block by default.

const TTL_SECONDS = Number(process.env.SESSION_TTL_HOURS || 12) * 3600;

function loadSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be set in production');
  }
  console.warn('[session] SESSION_SECRET not set: using a random key, so sessions end when the server restarts');
  return randomBytes(32).toString('hex');
}
const SECRET = loadSecret();

const b64url = input => Buffer.from(input).toString('base64url');
const sign = data => createHmac('sha256', SECRET).update(data).digest('base64url');
const HEADER = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

export function createSessionToken(user, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const payload = b64url(JSON.stringify({
    sub: String(user._id),
    ver: user.sessionVersion ?? 0,
    iat,
    exp: iat + TTL_SECONDS
  }));
  return `${HEADER}.${payload}.${sign(`${HEADER}.${payload}`)}`;
}

/** Returns { sub, ver, iat, exp } for a valid, unexpired token, otherwise null. */
export function verifySessionToken(token, now = Date.now()) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== HEADER) return null; // fixed algorithm, no "alg: none"

  const expected = Buffer.from(sign(`${parts[0]}.${parts[1]}`));
  const actual = Buffer.from(parts[2]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') return null;
  if (payload.exp <= Math.floor(now / 1000)) return null;
  return payload;
}
