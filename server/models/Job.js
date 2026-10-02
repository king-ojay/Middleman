import mongoose from 'mongoose';
import { AREAS } from '../config/areas.js';
import { CATEGORIES } from '../config/categories.js';

const jobSchema = new mongoose.Schema({
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  worker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  category: { type: String, enum: CATEGORIES, required: true },
  description: { type: String, required: true },
  area: { type: String, enum: AREAS, required: true },
  photos: [{ type: String }],
  budget: { type: Number, min: 0, default: null }, // client's expected budget in RWF, optional
  status: {
    type: String,
    enum: [
      'open',            // posted, awaiting quotes
      'quote_accepted',  // client picked a quote, awaiting escrow funding
      'escrow_held',     // funded, worker may begin
      'in_progress',
      'disputed',
      'completed'        // balance released, terminal state
    ],
    default: 'open'
  },
  agreedPrice: { type: Number, default: null },
  depositAmount: { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.model('Job', jobSchema);
