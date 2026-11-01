// User: client or worker, with area, trades, verification, referrer and the
// hashed PIN (never returned). Phone numbers are stored in E.164 (+250…).
import mongoose from 'mongoose';
import { AREAS } from '../../config/areas.js';
import { CATEGORIES } from '../../config/categories.js';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, unique: true },
  role: { type: String, enum: ['client', 'worker'], required: true },
  area: { type: String, enum: AREAS, required: true },
  skills: [{ type: String, enum: CATEGORIES }], // only relevant for role: 'worker', e.g. ['electrician', 'mason']
  verifiedStatus: {
    type: String,
    enum: ['unverified', 'pending', 'verified'],
    default: 'unverified'
  },
  // Who verified the person, when and how. Set and revoked only by the
  // researcher through the admin route (modules/users/verification.js); no
  // documents or photos are collected. Never sent to other users.
  verifiedBy: { type: String, enum: ['researcher', null], default: null },
  verifiedAt: { type: Date, default: null },
  verificationMethod: { type: String, enum: ['in-person', null], default: null },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // FR-03
  pinHash: { type: String, select: false }, // scrypt hash of the 4-digit login PIN, never returned
  sessionVersion: { type: Number, default: 0, select: false } // bump to end every session (e.g. PIN reset)
}, { timestamps: true });

userSchema.index({ role: 1, area: 1, skills: 1 });

export default mongoose.model('User', userSchema);
