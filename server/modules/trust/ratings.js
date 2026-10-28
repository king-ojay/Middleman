import mongoose from 'mongoose';
import Rating from './rating.model.js';
import { writeTrustEdgeFromRating } from './trustPropagation.js';

export const MAX_COMMENT_LENGTH = 500;

// Throws a plain Error with a user-facing message when the input is unusable.
export function validateRatingInput({ score, comment = '' }) {
  if (!Number.isInteger(score) || score < 1 || score > 5) throw new Error('Choose a rating from 1 to 5 stars');
  if (String(comment).length > MAX_COMMENT_LENGTH) throw new Error(`Keep the comment under ${MAX_COMMENT_LENGTH} characters`);
}

/**
 * Stores one rating and writes its trust edge (FR-15), as one unit: both are
 * written or neither is. Used for both directions: client -> worker on
 * confirmation, worker -> client after marking complete. Pass the caller's
 * `session` to join its transaction; otherwise this runs its own. A second
 * rating of the same job by the same person is rejected by the Rating
 * model's unique index (code 11000) and nothing is written.
 */
export async function writeRating({ job, fromUser, toUser, score, referredFlag = false, comment = '', session = null }) {
  const write = async s => {
    const [rating] = await Rating.create([{
      job,
      fromUser,
      toUser,
      score,
      referredFlag: Boolean(referredFlag),
      comment: String(comment).trim()
    }], { session: s });
    await writeTrustEdgeFromRating({ fromUser, toUser, score, referredFlag }, { session: s });
    return rating;
  };
  return session ? write(session) : mongoose.connection.transaction(write);
}
