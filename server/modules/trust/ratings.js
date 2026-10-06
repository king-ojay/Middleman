import Rating from './rating.model.js';
import { writeTrustEdgeFromRating } from './trustPropagation.js';

export const MAX_COMMENT_LENGTH = 500;

// Throws a plain Error with a user-facing message when the input is unusable.
export function validateRatingInput({ score, comment = '' }) {
  if (!Number.isInteger(score) || score < 1 || score > 5) throw new Error('Choose a rating from 1 to 5 stars');
  if (String(comment).length > MAX_COMMENT_LENGTH) throw new Error(`Keep the comment under ${MAX_COMMENT_LENGTH} characters`);
}

/**
 * Stores one rating and writes its trust edge (FR-15). Used for both
 * directions: client -> worker on confirmation, worker -> client after
 * marking complete. A second rating of the same job by the same person is
 * rejected by the Rating model's unique index (code 11000).
 */
export async function writeRating({ job, fromUser, toUser, score, referredFlag = false, comment = '' }) {
  const rating = await Rating.create({
    job,
    fromUser,
    toUser,
    score,
    referredFlag: Boolean(referredFlag),
    comment: String(comment).trim()
  });
  await writeTrustEdgeFromRating({ fromUser, toUser, score, referredFlag });
  return rating;
}
