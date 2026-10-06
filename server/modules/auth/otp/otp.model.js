import mongoose from 'mongoose';

// One pending code per phone and purpose. Only an HMAC of the code is stored;
// MongoDB's TTL index removes the document once it expires.
const otpSchema = new mongoose.Schema({
  phone: { type: String, required: true },
  purpose: { type: String, enum: ['register', 'pin_reset'], required: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true }
}, { timestamps: true });

otpSchema.index({ phone: 1, purpose: 1 }, { unique: true });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('Otp', otpSchema);
