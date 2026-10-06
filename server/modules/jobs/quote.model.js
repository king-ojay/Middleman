import mongoose from 'mongoose';

// A worker's single response to a job's proposed price (FR-05): either an
// acceptance (isCounter false, amount === job.proposedPrice) or a counter-amount.
const quoteSchema = new mongoose.Schema({
  job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
  worker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true, min: 1 },
  isCounter: { type: Boolean, required: true },
  depositAmount: { type: Number, default: 0, min: 0 }, // optional materials deposit, stored only until Phase 3
  status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' }
}, { timestamps: true });

// One response per worker per job: no per-worker back-and-forth (Section 3.3.3).
quoteSchema.index({ job: 1, worker: 1 }, { unique: true });

export default mongoose.model('Quote', quoteSchema);
