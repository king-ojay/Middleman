// Deletes one account and everything that refers to it, through the admin
// routes (modules/users/deletion.routes.js), so it needs ADMIN_SECRET (the
// same value as on the API). --dry-run only shows what would be removed.
// Prints the account's id, role and area and the counts: never the name or
// the phone number.
//
//   API_URL=https://middleman-api-74zb.onrender.com ADMIN_SECRET=... \
//     node scripts/deleteUser.js --phone 0788123456 --dry-run
//   node --env-file=.env scripts/deleteUser.js --phone 0788123456
//
// API_URL defaults to http://localhost:4000. Refused, with nothing changed,
// while one of the account's jobs has money in escrow, a payment or payout in
// progress, or an open dispute.
const args = process.argv.slice(2);
const value = flag => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const phone = value('--phone');
const dryRun = args.includes('--dry-run');
const api = (process.env.API_URL || 'http://localhost:4000').replace(/\/+$/, '');

if (!process.env.ADMIN_SECRET) {
  console.error('Set ADMIN_SECRET (the same value as on the API).');
  process.exit(1);
}
if (!phone) {
  console.error('Usage: node scripts/deleteUser.js --phone 07XXXXXXXX [--dry-run]');
  process.exit(1);
}

const post = async (path, body) => {
  const res = await fetch(`${api}/api/admin/users/deletion/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-secret': process.env.ADMIN_SECRET },
    body: JSON.stringify(body)
  });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) };
};

const COUNT_LABELS = {
  user: 'account',
  otpCodes: 'pending OTP codes',
  ratingsGiven: 'ratings given',
  ratingsReceived: 'ratings received',
  trustEdgesRating: 'trust edges from ratings',
  trustEdgesReferral: 'trust edges from invitations',
  offers: 'offers',
  jobsDeleted: 'jobs deleted (no money settled)',
  jobsKeptWithoutThem: 'jobs kept for the other party, without them',
  jobsReopened: 'jobs reopened for the client',
  referralsCleared: 'people they invited (link cleared)',
  ledgerEntriesAnonymised: 'ledger entries kept, their id removed'
};

const print = ({ user, counts, blockers }, heading) => {
  console.log(`${heading}: user ${user._id} (${user.role}, ${user.area})`);
  for (const [key, label] of Object.entries(COUNT_LABELS)) console.log(`  ${String(counts[key] ?? 0).padStart(4)}  ${label}`);
  if (blockers?.length) {
    console.log('Blocked by:');
    for (const b of blockers) console.log(`  job ${b.jobId}: ${b.reason}`);
  }
};

const preview = await post('preview', { phone });
if (!preview.ok) {
  console.error(`Failed (${preview.status}): ${preview.body.error || 'no answer'}`);
  process.exit(1);
}
if (dryRun) {
  print(preview.body, 'Dry run, nothing changed. Would remove');
  process.exit(0);
}
if (preview.body.blockers.length) {
  print(preview.body, 'Not deleted');
  process.exit(1);
}
const done = await post('delete', { userId: String(preview.body.user._id) });
if (!done.ok) {
  console.error(`Failed (${done.status}): ${done.body.error || 'no answer'}`);
  for (const b of done.body.blockers || []) console.error(`  job ${b.jobId}: ${b.reason}`);
  process.exit(1);
}
print(done.body, 'Deleted');
