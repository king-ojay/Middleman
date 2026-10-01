import mongoose from 'mongoose';

const quoteSchema = new mongoose.Schema({
  job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
  worker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  depositAmount: { type: Number, default: 0 }, // e.g. for materials, requested upfront
  status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' }
}, { timestamps: true });

export default mongoose.model('Quote', quoteSchema);
