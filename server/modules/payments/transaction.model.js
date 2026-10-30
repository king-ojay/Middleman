import mongoose from 'mongoose';

// The escrow ledger: one record per escrow state change, append-only (nothing
// updates or deletes a record). A money movement writes `<kind>_requested`
// when it starts and `<kind>_succeeded` or `<kind>_failed` when the provider
// settles it; a dispute writes `dispute_opened`. No phone numbers or account
// numbers are stored, only the job, the people's ids and the provider's
// reference for the movement.
export const LEDGER_EVENTS = [
  'fund_requested', 'fund_succeeded', 'fund_failed',
  'release_requested', 'release_succeeded', 'release_failed',
  'refund_requested', 'refund_succeeded', 'refund_failed',
  'dispute_opened'
];

const transactionSchema = new mongoose.Schema({
  job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
  event: { type: String, enum: LEDGER_EVENTS, required: true },
  escrowFrom: { type: String, required: true }, // job.escrow.status before
  escrowTo: { type: String, required: true },   // and after
  jobStatus: { type: String, required: true },  // job.status after
  amount: { type: Number, default: null },
  currency: { type: String, default: null },
  provider: { type: String, default: null },    // fake | momo-sandbox
  providerRef: { type: String, default: null }, // idempotency key sent with the call (X-Reference-Id)
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  actorRole: { type: String, enum: ['client', 'worker', 'admin', 'system'], required: true },
  reason: { type: String, default: '' }
}, { timestamps: { createdAt: true, updatedAt: false } });

transactionSchema.index({ job: 1, createdAt: 1 });
// Each movement is requested once and settles once, so a repeated callback or
// a racing poll can't write a second "succeeded" record.
transactionSchema.index(
  { providerRef: 1, event: 1 },
  { unique: true, partialFilterExpression: { providerRef: { $type: 'string' } } }
);

export default mongoose.model('Transaction', transactionSchema);
