// Deleting an account, all of it, in one transaction (deleteUser), and the
// same clean-up for references to accounts that are already gone
// (cleanOrphans, for accounts deleted before this existed).
//
// What goes:
//   the user, their pending OTP codes;
//   ratings they gave and received; trust edges from and to them (rating and
//   signup_referral);
//   their offers (quotes);
//   jobs they posted where no money was ever settled, with those jobs' offers.
// What stays, without them:
//   jobs where money was released or refunded: the other party's record and
//   Transactions page need them. The deleted person's place on the job
//   (client, worker, disputedBy) is set to null, which the app shows as
//   "Deleted user";
//   a job another client had chosen them for but not yet paid goes back to
//   open, with the other offers live again, so the client can choose someone
//   else;
//   the payment ledger: amounts, references and times are kept; the ledger
//   holds no names or phone numbers, and the deleted person's id (actor) is
//   set to null;
//   other people they invited: referredBy is set to null.
// Refused (nothing changes) while any of their jobs has money in escrow, a
// payment or payout in flight, or an open dispute: an admin settles it first.
import mongoose from 'mongoose';
import User from './user.model.js';
import Otp from '../auth/otp/otp.model.js';
import Job from '../jobs/job.model.js';
import Quote from '../jobs/quote.model.js';
import Rating from '../trust/rating.model.js';
import TrustEdge from '../trust/trustEdge.model.js';
import Transaction from '../payments/transaction.model.js';
import { HttpError } from '../httpError.js';

const IN_ESCROW = ['funding', 'held', 'releasing', 'refunding'];
const SETTLED = ['released', 'refunded'];

const same = (a, b) => a != null && String(a) === String(b);

/** Why this job stops a deletion, or null. */
export function blockerOf(job) {
  if (job.status === 'disputed') return 'open dispute';
  if (job.escrow?.pending) return 'payment or payout in progress';
  if (IN_ESCROW.includes(job.escrow?.status)) return 'money held in escrow';
  return null;
}

/**
 * Everything that refers to user `id` (who may already be gone) and what the
 * cascade would do with it. Read-only.
 */
async function cascadePlan(id, session) {
  const q = query => query.session(session);
  const jobs = await q(Job.find({ $or: [{ client: id }, { worker: id }, { disputedBy: id }] }, 'client worker status escrow disputedBy').lean());
  const blockers = jobs.map(j => ({ jobId: j._id, reason: blockerOf(j) })).filter(b => b.reason);
  const settled = j => SETTLED.includes(j.escrow?.status);
  const posted = jobs.filter(j => same(j.client, id));
  const chosenFor = jobs.filter(j => same(j.worker, id) && !same(j.client, id));

  const plan = {
    id,
    blockers,
    deleteJobs: posted.filter(j => !settled(j)).map(j => j._id),
    keepAsClient: posted.filter(settled).map(j => j._id),
    keepAsWorker: chosenFor.filter(settled).map(j => j._id),
    reopen: chosenFor.filter(j => !settled(j)).map(j => j._id),
    disputedBy: jobs.filter(j => same(j.disputedBy, id)).map(j => j._id)
  };
  const offers = { $or: [{ worker: id }, { job: { $in: plan.deleteJobs } }] };
  const [ratingsGiven, ratingsReceived, ratingEdges, referralEdges, offerCount, referralsCleared, ledgerEntriesAnonymised] = await Promise.all([
    q(Rating.countDocuments({ fromUser: id })),
    q(Rating.countDocuments({ toUser: id, fromUser: { $ne: id } })),
    q(TrustEdge.countDocuments({ type: 'rating', $or: [{ fromUser: id }, { toUser: id }] })),
    q(TrustEdge.countDocuments({ type: 'signup_referral', $or: [{ fromUser: id }, { toUser: id }] })),
    q(Quote.countDocuments(offers)),
    q(User.countDocuments({ referredBy: id })),
    q(Transaction.countDocuments({ actor: id }))
  ]);
  plan.offerFilter = offers;
  plan.counts = {
    ratingsGiven,
    ratingsReceived,
    trustEdgesRating: ratingEdges,
    trustEdgesReferral: referralEdges,
    offers: offerCount,
    jobsDeleted: plan.deleteJobs.length,
    jobsKeptWithoutThem: plan.keepAsClient.length + plan.keepAsWorker.length,
    jobsReopened: plan.reopen.length,
    referralsCleared,
    ledgerEntriesAnonymised
  };
  return plan;
}

/** Carries out a cascadePlan inside `session`. */
async function applyCascade(plan, session) {
  const { id } = plan;
  const opts = { session };
  await Rating.deleteMany({ $or: [{ fromUser: id }, { toUser: id }] }, opts);
  await TrustEdge.deleteMany({ $or: [{ fromUser: id }, { toUser: id }] }, opts);
  await Quote.deleteMany(plan.offerFilter, opts);
  await Job.deleteMany({ _id: { $in: plan.deleteJobs } }, opts);
  await Job.updateMany({ _id: { $in: plan.keepAsClient } }, { client: null }, opts);
  await Job.updateMany({ _id: { $in: plan.keepAsWorker } }, { worker: null }, opts);
  await Job.updateMany({ _id: { $in: plan.disputedBy } }, { disputedBy: null }, opts);
  await Job.updateMany(
    { _id: { $in: plan.reopen } },
    { status: 'open', worker: null, agreedPrice: null, depositAmount: 0, acceptedAt: null, 'escrow.lastFailure': null },
    opts
  );
  await Quote.updateMany({ job: { $in: plan.reopen }, status: 'declined' }, { status: 'pending' }, opts);
  await User.updateMany({ referredBy: id }, { referredBy: null }, opts);
  await Transaction.updateMany({ actor: id }, { actor: null }, opts);
}

/**
 * Deletes the account `userId` and everything listed at the top of this
 * file, in one transaction. With `dryRun`, changes nothing and returns what
 * it would do. Returns { user, counts, blockers, deleted }; `user` has the
 * id, role, area, first name and the phone's last 3 digits (for the admin to
 * check it is the right person). Throws 409 with `blockers` when refused.
 */
export async function deleteUser(userId, { dryRun = false } = {}) {
  if (!mongoose.isValidObjectId(userId)) throw new HttpError(404, 'User not found');
  const run = async session => {
    const user = await User.findById(userId, 'name phone role area').session(session).lean();
    if (!user) throw new HttpError(404, 'User not found');
    const plan = await cascadePlan(user._id, session);
    const otpCodes = await Otp.countDocuments({ phone: user.phone }).session(session);
    const result = {
      user: { _id: user._id, role: user.role, area: user.area, firstName: user.name.split(/\s+/)[0], phoneEnding: user.phone.slice(-3) },
      counts: { user: 1, otpCodes, ...plan.counts },
      blockers: plan.blockers,
      deleted: false
    };
    if (dryRun) return result;
    if (plan.blockers.length) {
      const err = new HttpError(409, "This account can't be deleted yet: settle its jobs with money in escrow, payments in progress or open disputes first");
      err.blockers = plan.blockers;
      throw err;
    }
    await applyCascade(plan, session);
    await Otp.deleteMany({ phone: user.phone }, { session });
    await User.deleteOne({ _id: user._id }, { session });
    return { ...result, deleted: true };
  };
  return dryRun ? run(null) : mongoose.connection.transaction(run);
}

// Every user id referred to in the collections that point at users.
async function referencedIds() {
  const lists = await Promise.all([
    Rating.distinct('fromUser'), Rating.distinct('toUser'),
    TrustEdge.distinct('fromUser'), TrustEdge.distinct('toUser'),
    Quote.distinct('worker'),
    Job.distinct('client'), Job.distinct('worker'), Job.distinct('disputedBy'),
    User.distinct('referredBy'),
    Transaction.distinct('actor')
  ]);
  return [...new Map(lists.flat().filter(Boolean).map(id => [String(id), id])).values()];
}

/**
 * Finds references to accounts that no longer exist and removes them the way
 * deleteUser would have (ratings, trust edges, offers and unsettled jobs go;
 * settled jobs keep the other party with the missing one set to null), plus
 * offers on jobs that no longer exist. A missing account with a job that has
 * money in escrow, a payment in flight or an open dispute is left alone and
 * listed under `skipped`. With `dryRun`, changes nothing.
 * Returns { missingUsers, counts, skipped }.
 */
export async function cleanOrphans({ dryRun = false } = {}) {
  // node --test sets NODE_TEST_CONTEXT: under test, only a test database.
  if (process.env.NODE_TEST_CONTEXT && !/test/i.test(mongoose.connection.name || '')) {
    throw new Error(`cleanOrphans under test only runs on a database with "test" in its name, not "${mongoose.connection.name}"`);
  }
  const run = async session => {
    const referenced = await referencedIds();
    const existing = new Set((await User.find({ _id: { $in: referenced } }, '_id').session(session).lean()).map(u => String(u._id)));
    const missing = referenced.filter(id => !existing.has(String(id)));

    const counts = {
      ratings: 0, trustEdges: 0, offers: 0, jobsDeleted: 0, jobsKeptWithoutThem: 0, jobsReopened: 0, referralsCleared: 0, ledgerEntriesAnonymised: 0
    };
    const skipped = [];
    for (const id of missing) {
      const plan = await cascadePlan(id, session);
      if (plan.blockers.length) {
        skipped.push({ missingUser: id, blockers: plan.blockers });
        continue;
      }
      const c = plan.counts;
      counts.ratings += c.ratingsGiven + c.ratingsReceived;
      counts.trustEdges += c.trustEdgesRating + c.trustEdgesReferral;
      counts.offers += c.offers;
      counts.jobsDeleted += c.jobsDeleted;
      counts.jobsKeptWithoutThem += c.jobsKeptWithoutThem;
      counts.jobsReopened += c.jobsReopened;
      counts.referralsCleared += c.referralsCleared;
      counts.ledgerEntriesAnonymised += c.ledgerEntriesAnonymised;
      if (!dryRun) await applyCascade(plan, session);
    }

    // Offers on jobs that are gone (after the jobs above are removed).
    const jobIds = await Job.distinct('_id').session(session);
    const strayOffers = { job: { $nin: jobIds } };
    counts.offersOnMissingJobs = await Quote.countDocuments(strayOffers).session(session);
    if (!dryRun) await Quote.deleteMany(strayOffers, { session });

    return { missingUsers: missing.length - skipped.length, counts, skipped };
  };
  return dryRun ? run(null) : mongoose.connection.transaction(run);
}
