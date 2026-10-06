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
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

userSchema.index({ role: 1, area: 1, skills: 1 });

export default mongoose.model('User', userSchema);
