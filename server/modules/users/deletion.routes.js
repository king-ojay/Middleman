// Account deletion for the admin (modules/users/deleteUser.js), behind
// ADMIN_SECRET like the other admin routes. The /admin page and
// scripts/deleteUser.js use them: first the preview, which shows what would
// be removed (and anything that stops it), then the deletion by id.
//
//   POST /api/admin/users/deletion/preview  Body: { phone } or { userId }
//   POST /api/admin/users/deletion/delete   Body: { userId }
//
// Both answer { user: { _id, role, area, firstName, phoneEnding }, counts,
// blockers, deleted }: never the full phone number.
import express from 'express';
import { deleteUser } from './deleteUser.js';
import { findUser } from './verification.js';
import { HttpError } from '../httpError.js';
import { requireAdmin } from '../adminAuth.js';
import { serverError } from '../serverError.js';

export const deletionRouter = express.Router();
deletionRouter.use(requireAdmin);

const handle = fn => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...(err.blockers && { blockers: err.blockers }) });
    serverError(res, err, req);
  }
};

deletionRouter.post('/users/deletion/preview', handle(async (req, res) => {
  res.json(await deleteUser(await findUser(req.body), { dryRun: true }));
}));

// By id only, as shown by the preview, so a mistyped number can't delete someone else.
deletionRouter.post('/users/deletion/delete', handle(async (req, res) => {
  const { userId } = req.body || {};
  if (typeof userId !== 'string' || !userId) throw new HttpError(400, 'Give the userId from the preview');
  res.json(await deleteUser(userId));
}));
