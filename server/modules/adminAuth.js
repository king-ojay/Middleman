// Admin routes (dispute settling, verification) are protected by a shared
// secret in the X-Admin-Secret header (ADMIN_SECRET env var), compared in
// constant time. They are off (503) when ADMIN_SECRET is unset.
import { createHash, timingSafeEqual } from 'node:crypto';

const digest = value => createHash('sha256').update(String(value)).digest();

export function requireAdmin(req, res, next) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return res.status(503).json({ error: 'Admin routes are off (set ADMIN_SECRET)' });
  if (!timingSafeEqual(digest(req.get('x-admin-secret') || ''), digest(secret))) return res.status(401).json({ error: 'Not allowed' });
  next();
}
