import mongoose from 'mongoose';
import { AREAS } from '../../config/areas.js';
import { CATEGORIES } from '../../config/categories.js';

// Job lifecycle (Fig. 5). Allowed moves live in ./lifecycle.js.
export const JOB_STATUSES = [
  'open',                  // posted with a proposed price, collecting worker responses
  'quote_accepted',        // client picked a response; agreedPrice is fixed
  'escrow_held',           // client paid the agreed price into escrow; worker may begin (FR-09)
  'in_progress',           // worker has started
  'awaiting_confirmation', // worker marked complete; client to confirm
  'completed',             // client confirmed; escrow is released to the worker
  'disputed',              // either party raised a problem; escrow is locked until an admin resolves it
  'resolved'               // dispute settled: escrow released to the worker or refunded to the client
];

// Where the escrowed money is (modules/payments/escrow.js). funding,
// releasing and refunding mean a provider call is in flight (escrow.pending).
export const ESCROW_STATUSES = ['none', 'funding', 'held', 'releasing', 'released', 'refunding', 'refunded'];

const escrowSchema = new mongoose.Schema({
  status: { type: String, enum: ESCROW_STATUSES, default: 'none' },
  amount: { type: Number, default: null },
  currency: { type: String, default: null },
  provider: { type: String, default: null },
  // The movement in flight: its kind, idempotency key, whether the provider
  // accepted it, and the job status to move to when it succeeds or fails.
  pending: {
    type: new mongoose.Schema({
      kind: { type: String, enum: ['fund', 'release', 'refund'], required: true },
      ref: { type: String, required: true },
      accepted: { type: Boolean, default: false },
      doneStatus: { type: String, required: true },
      backStatus: { type: String, required: true }
    }, { _id: false }),
    default: null
  },
  fundRef: { type: String, default: null },
  releaseRef: { type: String, default: null },
  refundRef: { type: String, default: null },
  heldAt: { type: Date, default: null },
  releasedAt: { type: Date, default: null },
  refundedAt: { type: Date, default: null }
}, { _id: false });

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
  disputedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  resolvedAt: { type: Date, default: null },
  escrow: { type: escrowSchema, default: () => ({}) }
}, { timestamps: true });

jobSchema.index({ status: 1, area: 1, category: 1 });
jobSchema.index({ 'escrow.pending.ref': 1 }, { sparse: true });

export default mongoose.model('Job', jobSchema);
