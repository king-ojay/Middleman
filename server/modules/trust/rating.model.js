import mongoose from 'mongoose';

// Bidirectional by design: fromUser -> toUser can be client->worker OR worker->client.
// Both directions use this same schema (see Chapter 3, Section 3.4.1).
const ratingSchema = new mongoose.Schema({
  job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
  fromUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  toUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  score: { type: Number, min: 1, max: 5, required: true },
  referredFlag: { type: Boolean, default: false }, // passive "vouch" beyond the numeric score
  comment: { type: String, default: '' }
}, { timestamps: true });

ratingSchema.index({ job: 1, fromUser: 1 }, { unique: true }); // one rating per direction per job

export default mongoose.model('Rating', ratingSchema);
