import mongoose from 'mongoose';

// The trust graph. One document = one directed, weighted edge.
// Generated from Ratings (job-based) and signup referrals (see Chapter 3, Section 3.2.3).
const trustEdgeSchema = new mongoose.Schema({
  fromUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  toUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['rating', 'signup_referral'], required: true },
  weight: { type: Number, required: true }, // normalised 0-1
  referredFlag: { type: Boolean, default: false },
  decayRate: { type: Number, default: 0.5 } // per-hop multiplier when traversing FROM this edge
}, { timestamps: true });

// Indexed both directions - traversal needs to walk outward from a node quickly.
trustEdgeSchema.index({ fromUser: 1 });
trustEdgeSchema.index({ toUser: 1 });

export default mongoose.model('TrustEdge', trustEdgeSchema);
