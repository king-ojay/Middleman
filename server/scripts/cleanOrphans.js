// One-off clean-up: finds ratings, trust edges, offers and jobs that refer to
// an account that no longer exists (deleted before scripts/deleteUser.js
// existed) and removes them the way deleteUser would have
// (modules/users/deleteUser.js cleanOrphans). Accounts with a job that still
// has money in escrow, a payment in flight or an open dispute are skipped and
// listed. Prints counts and ids only, never names or phone numbers.
//
//   MONGO_URI="<connection string>" node scripts/cleanOrphans.js --dry-run
//   MONGO_URI="<connection string>" node scripts/cleanOrphans.js --confirm
//
// --dry-run shows the counts and changes nothing. Without --confirm it
// removes nothing.
import 'dotenv/config';
import mongoose from 'mongoose';
import { getMongoUri } from '../config/db.js';
import { cleanOrphans } from '../modules/users/deleteUser.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
if (!dryRun && !args.includes('--confirm')) {
  console.error('Refusing to change anything without --confirm. Run with --dry-run first to see the counts:');
  console.error('  node scripts/cleanOrphans.js --dry-run');
  console.error('  node scripts/cleanOrphans.js --confirm');
  process.exit(1);
}

const ORPHAN_LABELS = {
  ratings: 'ratings',
  trustEdges: 'trust edges',
  offers: 'offers by missing workers or on removed jobs',
  offersOnMissingJobs: 'offers on jobs that no longer exist',
  jobsDeleted: 'jobs deleted (no money settled)',
  jobsKeptWithoutThem: 'jobs kept for the other party, missing account unlinked',
  jobsReopened: 'jobs reopened for the client',
  referralsCleared: 'invitation links cleared',
  ledgerEntriesAnonymised: 'ledger entries kept, missing id removed'
};

const { uri, description } = getMongoUri();
console.log(`Database: ${description}`);
await mongoose.connect(uri);
try {
  const { missingUsers, counts, skipped } = await cleanOrphans({ dryRun });
  console.log(`${dryRun ? 'Dry run, nothing changed. Would remove' : 'Removed'}: references to ${missingUsers} missing account(s)`);
  for (const [key, label] of Object.entries(ORPHAN_LABELS)) console.log(`  ${String(counts[key]).padStart(4)}  ${label}`);
  if (skipped.length) {
    console.log('Skipped (settle these first):');
    for (const s of skipped) for (const b of s.blockers) console.log(`  missing user ${s.missingUser}, job ${b.jobId}: ${b.reason}`);
  }
} finally {
  await mongoose.disconnect();
}
