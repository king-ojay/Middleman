import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, unique: true },
  role: { type: String, enum: ['client', 'worker'], required: true },
  area: { type: String, enum: ['kimironko', 'kwa_nayinzira'], required: true },
  skills: [{ type: String }], // only relevant for role: 'worker', e.g. ['electrician', 'mason']
  verifiedStatus: {
    type: String,
    enum: ['unverified', 'pending', 'verified'],
    default: 'unverified'
  },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

userSchema.index({ role: 1, area: 1, skills: 1 });

export default mongoose.model('User', userSchema);
