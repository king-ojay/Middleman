import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
  type: { type: String, enum: ['deposit', 'final'], required: true },
  amount: { type: Number, required: true },
  status: {
    type: String,
    enum: ['pending', 'escrow_held', 'released', 'refunded'],
    default: 'pending'
  },
  providerRef: { type: String, default: null }, // Paypack transaction reference
  heldAt: { type: Date, default: null },
  releasedAt: { type: Date, default: null }
}, { timestamps: true });

export default mongoose.model('Transaction', transactionSchema);
