// GET /api/admin/signup-codes — the admin relay (otp/codeRelay.js): sign-up
// codes from the last 15 minutes, newest first, as { codes: [{ phone
// (079*****563), code, issuedAt, expiresAt, expired }] }. Behind ADMIN_SECRET
// like every admin route. Each view is logged with the count only.
import express from 'express';
import { requireAdmin } from '../adminAuth.js';
import { signupCodes } from './otp/codeRelay.js';

export const codeRelayRouter = express.Router();
codeRelayRouter.use(requireAdmin);

codeRelayRouter.get('/signup-codes', (_req, res) => {
  const codes = signupCodes();
  console.log(`[admin] ${new Date().toISOString()} sign-up codes viewed (${codes.length} shown)`);
  res.json({ codes });
});
