import mongoose from 'mongoose';
import { AREAS } from '../../config/areas.js';
import { CATEGORIES } from '../../config/categories.js';

// Job lifecycle (Fig. 5). Allowed moves live in ./lifecycle.js.
export const JOB_STATUSES = [
  'open',                  // posted with a proposed price, collecting worker responses
  'quote_accepted',        // client picked a response; agreedPrice is fixed
  'escrow_held',           // Phase 3: funded, worker may begin (FR-09)
  'in_progress',           // worker has started
  'awaiting_confirmation', // worker marked complete; client to confirm (72h window in Phase 3)
  'completed',             // client confirmed, terminal
  'disputed'               // either party raised a problem, terminal until admin review
];

const jobSchema = new mongoose.Schema({
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  worker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  category: { type: String, enum: CATEGORIES, required: true },
  description: { type: String, required: true, trim: true },
  area: { type: String, enum: AREAS, required: true },
  photos: [{ type: String }],
  proposedPrice: { type: Number, required: true, min: 1 }, // client's asking price in RWF (FR-04)
  agreedPrice: { type: Number, default: null },            // fixed when the client picks a response (FR-05b)
  depositAmount: { type: Number, default: 0 },             // materials deposit agreed with the chosen response
  status: { type: String, enum: JOB_STATUSES, default: 'open' },
  acceptedAt: { type: Date, default: null },
  startedAt: { type: Date, default: null },
  workerCompletedAt: { type: Date, default: null }, // starts the confirmation window
  completedAt: { type: Date, default: null },
  disputedAt: { type: Date, default: null },
  disputedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

jobSchema.index({ status: 1, area: 1, category: 1 });

export default mongoose.model('Job', jobSchema);
