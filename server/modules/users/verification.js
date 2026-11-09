// Verification (FR-04): the researcher checks a participant in person and
// marks them verified; it can be revoked. Nothing else is collected: no
// documents, photos or ID numbers. Verified workers get the higher trust
// floor (computeTrust floorVerified 0.3 vs floorUnverified 0.1) and a
// "Verified" badge; who, when and how are kept for the record and never sent
// to other users.
//
//   POST /api/admin/verification/verify  Body: { userId } or { phone }
//   POST /api/admin/verification/revoke  Body: { userId } or { phone }
//   GET  /api/admin/verification/unverified  Workers not yet verified (read-only)
//
// All need the X-Admin-Secret header (adminAuth.js). verify and revoke answer
// with ids and verification fields only, no name or phone.
// scripts/verifyUser.js calls them. The unverified list is for the admin page
// (/admin), so the researcher can find the person in front of them: name,
// area, trades and only the last 3 digits of the phone.
import express from 'express';
import mongoose from 'mongoose';
import User from './user.model.js';
import { normalisePhone } from './phone.js';
import { HttpError } from '../httpError.js';
import { requireAdmin } from '../adminAuth.js';
import { serverError } from '../serverError.js';

const FIELDS = '_id role verifiedStatus verifiedBy verifiedAt verificationMethod';

const findUser = async ({ userId, phone } = {}) => {
  let filter;
  if (typeof userId === 'string' && userId) {
    if (!mongoose.isValidObjectId(userId)) throw new HttpError(404, 'User not found');
    filter = { _id: userId };
  } else if (typeof phone === 'string' && phone) {
    const normalized = normalisePhone(phone);
    if (!normalized) throw new HttpError(400, 'Not a valid phone number');
    filter = { phone: normalized };
  } else {
    throw new HttpError(400, 'Give userId or phone');
  }
  const user = await User.findOne(filter, '_id').lean();
  if (!user) throw new HttpError(404, 'User not found');
  return user._id;
};

/** Marks the person verified by the researcher, in person, now. */
export async function verifyUser(who) {
  const id = await findUser(who);
  return User.findByIdAndUpdate(id, {
    verifiedStatus: 'verified',
    verifiedBy: 'researcher',
    verifiedAt: new Date(),
    verificationMethod: 'in-person'
  }, { new: true, projection: FIELDS }).lean();
}

/** Revokes verification: back to unverified, with the record cleared. */
export async function revokeVerification(who) {
  const id = await findUser(who);
  return User.findByIdAndUpdate(id, {
    verifiedStatus: 'unverified',
    verifiedBy: null,
    verifiedAt: null,
    verificationMethod: null
  }, { new: true, projection: FIELDS }).lean();
}

export const verificationRouter = express.Router();
verificationRouter.use(requireAdmin);

verificationRouter.get('/verification/unverified', async (req, res) => {
  try {
    const workers = await User.find({ role: 'worker', verifiedStatus: { $ne: 'verified' } }, '_id name area skills phone')
      .sort({ _id: 1 }).lean(); // oldest signup first
    res.json(workers.map(({ phone, ...w }) => ({ ...w, phoneEnding: phone.slice(-3) })));
  } catch (err) {
    serverError(res, err, req);
  }
});

for (const [path, action] of [['verify', verifyUser], ['revoke', revokeVerification]]) {
  verificationRouter.post(`/verification/${path}`, async (req, res) => {
    try {
      res.json(await action(req.body));
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
      serverError(res, err, req);
    }
  });
}
