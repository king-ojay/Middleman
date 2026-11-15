// Deleting an account (modules/users/deleteUser.js) through the admin routes
// and scripts/deleteUser.js, and the one-off orphan clean-up. Jobs go through
// the real API with the fake payment provider, so the ledger, ratings and
// trust edges are what production writes. Needs TEST_MONGO_URI.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const MONGO = process.env.TEST_MONGO_URI && (() => {
  const url = new URL(process.env.TEST_MONGO_URI);
  url.pathname += '_deletion';
  return url.toString();
})();
const skip = !MONGO && 'set TEST_MONGO_URI to run API tests';
const ADMIN_SECRET = 'deletion-test-admin-secret';
const SERVER_DIR = fileURLToPath(new URL('..', import.meta.url));
const run = promisify(execFile);

let server, base, mongoose, models, users, tokens, jobs, cleanOrphans;

before(async () => {
  if (skip) return;
  if (!/test/i.test(MONGO)) throw new Error('TEST_MONGO_URI must point at a database with "test" in its name');
  process.env.SESSION_SECRET = 'api-test-secret';
  process.env.ADMIN_SECRET = ADMIN_SECRET;

  mongoose = (await import('mongoose')).default;
  models = {
    User: (await import('../modules/users/user.model.js')).default,
    Otp: (await import('../modules/auth/otp/otp.model.js')).default,
    Job: (await import('../modules/jobs/job.model.js')).default,
    Quote: (await import('../modules/jobs/quote.model.js')).default,
    Rating: (await import('../modules/trust/rating.model.js')).default,
    TrustEdge: (await import('../modules/trust/trustEdge.model.js')).default,
    Transaction: (await import('../modules/payments/transaction.model.js')).default
  };
  ({ cleanOrphans } = await import('../modules/users/deleteUser.js'));
  const { createFakeProvider } = await import('../modules/payments/providers/fake.js');
  const { setPaymentProvider } = await import('../modules/payments/providers/index.js');
  const { createSessionToken } = await import('../modules/auth/session.js');
  const { default: app } = await import('../app.js');

  await mongoose.connect(MONGO);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(models).map(M => M.createIndexes()));
  const { User, Otp, TrustEdge } = models;
  const [viewer, doomed, invited, clara, cyril, blocked, keeper] = await User.create([
    { name: 'Vera Viewer', phone: '0788640001', role: 'client', area: 'remera' },
    { name: 'Dan Doomed', phone: '0788640002', role: 'worker', area: 'remera', skills: ['plumber'] },
    { name: 'Wes Invited', phone: '0788640003', role: 'worker', area: 'gikondo', skills: ['plumber'] },
    { name: 'Clara Client', phone: '0788640004', role: 'client', area: 'remera' },
    { name: 'Cyril Client', phone: '0788640005', role: 'client', area: 'remera' },
    { name: 'Bea Blocked', phone: '0788640006', role: 'worker', area: 'remera', skills: ['plumber'] },
    { name: 'Kim Keeper', phone: '0788640007', role: 'client', area: 'remera' }
  ]);
  users = { viewer, doomed, invited, clara, cyril, blocked, keeper };
  // Dan invited Wes: Vera -> Dan -> Wes is Wes's only path from Vera.
  await User.updateOne({ _id: invited._id }, { referredBy: doomed._id });
  await TrustEdge.create({ fromUser: doomed._id, toUser: invited._id, type: 'signup_referral', weight: 1 });
  await Otp.create({ phone: doomed.phone, purpose: 'pin_reset', codeHash: 'x', expiresAt: new Date(Date.now() + 300000) });

  tokens = {};
  for (const [key, u] of Object.entries(users)) tokens[key] = createSessionToken(await User.findById(u._id).select('+sessionVersion'));
  setPaymentProvider(createFakeProvider());
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;

  const accepted = (client, worker, description, price) => models.Job.create({
    client: users[client]._id, worker: users[worker]._id, category: 'plumber', area: 'remera', description,
    proposedPrice: price, agreedPrice: price, status: 'quote_accepted', acceptedAt: new Date()
  });
  const ok = async (path, as, body, status = 200) => assert.equal((await call('POST', path, { as, body })).status, status, path);
  const paidAndDone = async (client, worker, description, price) => {
    const job = await accepted(client, worker, description, price);
    await ok(`/api/jobs/${job._id}/fund`, client);
    await ok(`/api/jobs/${job._id}/start`, worker);
    await ok(`/api/jobs/${job._id}/complete`, worker);
    return job;
  };
  jobs = {};

  // Vera hired Dan and rated him 5 stars; Dan rated Vera back.
  jobs.veraDan = await paidAndDone('viewer', 'doomed', 'Fix the sink', 15000);
  await ok(`/api/jobs/${jobs.veraDan._id}/confirm`, 'viewer', { score: 5 });
  await ok(`/api/jobs/${jobs.veraDan._id}/rate-client`, 'doomed', { score: 4 }, 201);
  // Clara hired Dan and rated him 4 stars.
  jobs.claraDan = await paidAndDone('clara', 'doomed', 'Unblock the drain', 9000);
  await ok(`/api/jobs/${jobs.claraDan._id}/confirm`, 'clara', { score: 4 });
  // Dan reported a problem on Cyril's job; the admin refunded Cyril.
  jobs.cyrilDisputed = await accepted('cyril', 'doomed', 'Paint the gate', 7000);
  await ok(`/api/jobs/${jobs.cyrilDisputed._id}/fund`, 'cyril');
  await ok(`/api/jobs/${jobs.cyrilDisputed._id}/dispute`, 'doomed', { reason: 'unreachable', details: 'The client stopped answering my calls.' });
  assert.equal((await call('POST', `/api/admin/jobs/${jobs.cyrilDisputed._id}/refund`, { admin: true })).status, 200);
  // Clara's open job: offers from Dan and Wes.
  jobs.claraOpen = await models.Job.create({ client: clara._id, category: 'plumber', area: 'remera', description: 'Replace the shower head', proposedPrice: 5000 });
  await ok(`/api/jobs/${jobs.claraOpen._id}/responses`, 'doomed', {}, 201);
  await ok(`/api/jobs/${jobs.claraOpen._id}/responses`, 'invited', {}, 201);
  // Cyril chose Dan over Wes but has not paid yet.
  jobs.cyrilChosen = await models.Job.create({ client: cyril._id, category: 'plumber', area: 'remera', description: 'Fit a new tap', proposedPrice: 6000 });
  await ok(`/api/jobs/${jobs.cyrilChosen._id}/responses`, 'doomed', {}, 201);
  await ok(`/api/jobs/${jobs.cyrilChosen._id}/responses`, 'invited', {}, 201);
  const dansOffer = await models.Quote.findOne({ job: jobs.cyrilChosen._id, worker: doomed._id }).lean();
  await ok(`/api/jobs/${jobs.cyrilChosen._id}/select`, 'cyril', { quoteId: String(dansOffer._id) });
  // Bea has Kim's money in escrow.
  jobs.held = await accepted('keeper', 'blocked', 'Tile the bathroom', 20000);
  await ok(`/api/jobs/${jobs.held._id}/fund`, 'keeper');
});

after(async () => {
  if (skip) return;
  server.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function call(method, path, { as, body, admin } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(as ? { authorization: `Bearer ${tokens[as]}` } : {}),
      ...(admin ? { 'x-admin-secret': ADMIN_SECRET } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const get = async (path, as) => {
  const res = await call('GET', path, { as });
  assert.equal(res.status, 200, `${as} GET ${path}`);
  return res.data;
};
const preview = body => call('POST', '/api/admin/users/deletion/preview', { admin: true, body });

// Every document in every collection, to show that nothing changed.
const snapshot = async () => Object.fromEntries(await Promise.all(
  Object.entries(models).map(async ([name, M]) => [name, JSON.stringify(await M.find().sort({ _id: 1 }).lean())])
));
// Every place a document can point at user `id`.
const referencesTo = async id => {
  const { User, Rating, TrustEdge, Quote, Job, Transaction } = models;
  return {
    ratings: await Rating.countDocuments({ $or: [{ fromUser: id }, { toUser: id }] }),
    trustEdges: await TrustEdge.countDocuments({ $or: [{ fromUser: id }, { toUser: id }] }),
    offers: await Quote.countDocuments({ worker: id }),
    jobs: await Job.countDocuments({ $or: [{ client: id }, { worker: id }, { disputedBy: id }] }),
    referredBy: await User.countDocuments({ referredBy: id }),
    ledger: await Transaction.countDocuments({ actor: id })
  };
};
const tierOf = async (as, name) => (await get('/api/discover?category=plumber', as)).find(w => w.name === name)?.reason?.tier;

test('the admin routes need ADMIN_SECRET', { skip }, async () => {
  const res = await call('POST', '/api/admin/users/deletion/preview', { body: { phone: users.doomed.phone } });
  assert.equal(res.status, 401);
  assert.equal((await call('POST', '/api/admin/users/deletion/delete', { body: { userId: String(users.doomed._id) } })).status, 401);
});

test('a dry run (preview) counts what would go and changes nothing; no full phone number in the answer', { skip }, async () => {
  const before = await snapshot();
  const res = await preview({ phone: '0788 640 002' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.data.user, { _id: String(users.doomed._id), role: 'worker', area: 'remera', firstName: 'Dan', phoneEnding: '002' });
  assert.deepEqual(res.data.counts, {
    user: 1,
    otpCodes: 1,
    ratingsGiven: 1,           // Dan -> Vera
    ratingsReceived: 2,        // Vera -> Dan, Clara -> Dan
    trustEdgesRating: 3,
    trustEdgesReferral: 1,     // Dan -> Wes
    offers: 2,                 // on Clara's open job and on Cyril's chosen job
    jobsDeleted: 0,            // a worker posts no jobs
    jobsKeptWithoutThem: 3,    // Vera's and Clara's (released), Cyril's (refunded)
    jobsReopened: 1,           // Cyril chose Dan but has not paid
    referralsCleared: 1,       // Wes
    ledgerEntriesAnonymised: 1 // Dan's dispute record
  });
  assert.deepEqual(res.data.blockers, []);
  assert.equal(res.data.deleted, false);
  assert.equal(JSON.stringify(res.data).includes('640002'), false);
  assert.deepEqual(await snapshot(), before);
});

test('scripts/deleteUser.js --dry-run prints the counts, ids only, and changes nothing', { skip }, async () => {
  const before = await snapshot();
  const { stdout } = await run('node', ['scripts/deleteUser.js', '--phone', users.doomed.phone, '--dry-run'], {
    cwd: SERVER_DIR, env: { ...process.env, API_URL: base, ADMIN_SECRET }
  });
  assert.match(stdout, new RegExp(`^Dry run, nothing changed. Would remove: user ${users.doomed._id} \\(worker, remera\\)\\n`));
  assert.match(stdout, /^ {5}2 {2}offers$/m);
  assert.match(stdout, /^ {5}1 {2}ledger entries kept, their id removed$/m);
  assert.equal(/Dan|Doomed|640002/.test(stdout), false);
  assert.deepEqual(await snapshot(), before);
});

test('money in escrow stops the deletion: a clear error, the jobs that block it, nothing changed', { skip }, async () => {
  const before = await snapshot();
  const shown = await preview({ userId: String(users.blocked._id) });
  assert.deepEqual(shown.data.blockers, [{ jobId: String(jobs.held._id), reason: 'money held in escrow' }]);
  const res = await call('POST', '/api/admin/users/deletion/delete', { admin: true, body: { userId: String(users.blocked._id) } });
  assert.equal(res.status, 409);
  assert.match(res.data.error, /can't be deleted yet/);
  assert.deepEqual(res.data.blockers, [{ jobId: String(jobs.held._id), reason: 'money held in escrow' }]);
  assert.deepEqual(await snapshot(), before);
});

test('deleting removes everything that refers to the account, keeps the ledger without them, and other people\'s pages still load', { skip }, async () => {
  const { User, Otp, Job, Quote, Transaction } = models;
  assert.equal(await tierOf('viewer', 'Wes Invited'), 'network'); // through Dan
  const ledgerBefore = await Transaction.find().sort({ _id: 1 }).lean();

  const res = await call('POST', '/api/admin/users/deletion/delete', { admin: true, body: { userId: String(users.doomed._id) } });
  assert.equal(res.status, 200);
  assert.equal(res.data.deleted, true);

  // Nothing refers to Dan any more.
  assert.equal(await User.countDocuments({ _id: users.doomed._id }), 0);
  assert.equal(await Otp.countDocuments({ phone: users.doomed.phone }), 0);
  assert.deepEqual(await referencesTo(users.doomed._id), { ratings: 0, trustEdges: 0, offers: 0, jobs: 0, referredBy: 0, ledger: 0 });
  assert.equal((await call('GET', '/api/jobs/mine', { as: 'doomed' })).status, 401);

  // The ledger: every record kept, amounts, references and times unchanged; Dan's id gone.
  const ledgerAfter = await Transaction.find().sort({ _id: 1 }).lean();
  assert.equal(ledgerAfter.length, ledgerBefore.length);
  ledgerBefore.forEach((was, i) => {
    const now = ledgerAfter[i];
    for (const field of ['_id', 'job', 'event', 'amount', 'currency', 'providerRef', 'createdAt', 'actorRole', 'escrowFrom', 'escrowTo']) {
      assert.deepEqual(now[field], was[field], `${was.event} ${field}`);
    }
    assert.deepEqual(now.actor, String(was.actor) === String(users.doomed._id) ? null : was.actor);
  });

  // Jobs: paid-out and refunded ones stay without Dan; the unpaid choice is open again with Wes's offer live.
  for (const key of ['veraDan', 'claraDan', 'cyrilDisputed']) assert.equal((await Job.findById(jobs[key]._id).lean()).worker, null, key);
  assert.equal((await Job.findById(jobs.cyrilDisputed._id).lean()).disputedBy, null);
  const reopened = await Job.findById(jobs.cyrilChosen._id).lean();
  assert.deepEqual([reopened.status, reopened.worker, reopened.agreedPrice], ['open', null, null]);
  assert.deepEqual((await Quote.find({ job: jobs.cyrilChosen._id }).lean()).map(q => q.status), ['pending']);

  // Rankings recompute: Wes was in Vera's network only through Dan.
  assert.notEqual(await tierOf('viewer', 'Wes Invited'), 'network');
  assert.equal((await User.findById(users.invited._id).lean()).referredBy, null);

  // Other people's pages load.
  await get('/api/jobs/feed?area=all', 'invited');
  for (const as of ['viewer', 'clara', 'cyril']) {
    await get('/api/jobs/mine', as);
    for (const who of ['viewer', 'invited', 'clara']) await get(`/api/users/${users[who]._id}/profile`, as);
  }
  const offers = await get(`/api/jobs/${jobs.claraOpen._id}`, 'clara');
  assert.deepEqual(offers.responses.map(r => r.worker.name), ['Wes Invited']);
  const veraProfile = await get(`/api/users/${users.viewer._id}/profile`, 'viewer');
  assert.equal(veraProfile.stats.ratingCount, 0); // Dan's rating of Vera is gone
  const paidJob = await get(`/api/jobs/${jobs.veraDan._id}`, 'viewer');
  assert.equal(paidJob.worker, null);

  // Transactions of the other party: rows kept, Dan shown as nobody (the app says "Deleted user").
  const vera = await get('/api/transactions', 'viewer');
  assert.deepEqual(vera.transactions.map(r => `${r.type} ${r.status} ${r.amount} ${r.other}`), ['released completed 15000 null', 'paid_in completed 15000 null']);
  assert.deepEqual(vera.totals, { total: 15000, jobs: 1 });
  const cyril = await get('/api/transactions', 'cyril');
  assert.deepEqual(cyril.transactions.map(r => `${r.type} ${r.status} ${r.other}`), ['refunded refunded null', 'paid_in refunded null']);

  // Rating someone who is gone is refused, not a server error.
  const rating = await call('POST', `/api/jobs/${jobs.claraDan._id}/confirm`, { as: 'clara', body: { score: 5 } });
  assert.equal(rating.status, 409);
});

test('a client\'s deletion removes the jobs they posted with no money settled, and their offers, but keeps paid-out jobs for the worker', { skip }, async () => {
  const { Job, Quote } = models;
  // Kim: one job with money held (Bea's), so settle it first: Bea finishes, Kim confirms.
  await call('POST', `/api/jobs/${jobs.held._id}/start`, { as: 'blocked' });
  await call('POST', `/api/jobs/${jobs.held._id}/complete`, { as: 'blocked' });
  assert.equal((await call('POST', `/api/jobs/${jobs.held._id}/confirm`, { as: 'keeper', body: { score: 5 } })).status, 200);
  const open = await Job.create({ client: users.keeper._id, category: 'plumber', area: 'remera', description: 'Kim open job', proposedPrice: 3000 });
  assert.equal((await call('POST', `/api/jobs/${open._id}/responses`, { as: 'blocked' })).status, 201);

  const res = await call('POST', '/api/admin/users/deletion/delete', { admin: true, body: { userId: String(users.keeper._id) } });
  assert.equal(res.status, 200);
  assert.deepEqual([res.data.counts.jobsDeleted, res.data.counts.jobsKeptWithoutThem, res.data.counts.offers], [1, 1, 1]);
  assert.equal(await Job.countDocuments({ _id: open._id }), 0);
  assert.equal(await Quote.countDocuments({ job: open._id }), 0);
  assert.equal((await Job.findById(jobs.held._id).lean()).client, null);
  assert.deepEqual(await referencesTo(users.keeper._id), { ratings: 0, trustEdges: 0, offers: 0, jobs: 0, referredBy: 0, ledger: 0 });

  // Bea's pages still load, and her Transactions page shows the payment with nobody's name.
  await get('/api/jobs/feed?area=all', 'blocked');
  await get('/api/jobs/mine', 'blocked');
  await get(`/api/jobs/${jobs.held._id}`, 'blocked');
  const bea = await get('/api/transactions', 'blocked');
  assert.deepEqual(bea.transactions.map(r => `${r.type} ${r.status} ${r.amount} ${r.other}`), ['received completed 20000 null']);
  await get(`/api/users/${users.blocked._id}/profile`, 'blocked');
  assert.equal((await call('POST', `/api/jobs/${jobs.held._id}/rate-client`, { as: 'blocked', body: { score: 4 } })).status, 409);
});

test('orphan clean-up: a dry run changes nothing; then only references to missing accounts go', { skip }, async () => {
  const { User, Job, Quote, Rating, TrustEdge } = models;
  // Ghost: an account removed the old way, leaving its references behind.
  const ghost = await User.create({ name: 'Gus Ghost', phone: '0788640099', role: 'worker', area: 'remera', skills: ['plumber'] });
  const settledJob = await Job.create({
    client: users.clara._id, worker: ghost._id, category: 'plumber', area: 'remera', description: 'Ghost paid job', proposedPrice: 1000,
    agreedPrice: 1000, status: 'completed', escrow: { status: 'released', amount: 1000, currency: 'RWF', provider: 'fake' }
  });
  const ghostJobFor = await Job.create({ client: users.clara._id, category: 'plumber', area: 'remera', description: 'Ghost offered', proposedPrice: 1000 });
  await Quote.create([
    { job: ghostJobFor._id, worker: ghost._id, amount: 1000, isCounter: false },
    { job: ghostJobFor._id, worker: users.invited._id, amount: 1000, isCounter: false }
  ]);
  await Rating.create({ job: settledJob._id, fromUser: users.clara._id, toUser: ghost._id, score: 5 });
  await TrustEdge.create([
    { fromUser: users.clara._id, toUser: ghost._id, type: 'rating', weight: 1 },
    { fromUser: ghost._id, toUser: users.invited._id, type: 'signup_referral', weight: 1 }
  ]);
  // An offer on a job that is gone.
  await Quote.create({ job: new mongoose.Types.ObjectId(), worker: users.invited._id, amount: 500, isCounter: false });
  await User.collection.deleteOne({ _id: ghost._id });

  const before = await snapshot();
  const dry = await cleanOrphans({ dryRun: true });
  assert.deepEqual(await snapshot(), before);
  assert.equal(dry.missingUsers, 1);
  assert.deepEqual(dry.counts, {
    ratings: 1, trustEdges: 2, offers: 1, offersOnMissingJobs: 1,
    jobsDeleted: 0, jobsKeptWithoutThem: 1, jobsReopened: 0, referralsCleared: 0, ledgerEntriesAnonymised: 0
  });

  const { stdout } = await run('node', ['scripts/cleanOrphans.js', '--dry-run'], { cwd: SERVER_DIR, env: { ...process.env, MONGO_URI: MONGO } });
  assert.match(stdout, /Dry run, nothing changed. Would remove: references to 1 missing account\(s\)\n/);
  assert.match(stdout, /^ {5}2 {2}trust edges$/m);
  assert.deepEqual(await snapshot(), before);

  const counts = {
    ratings: await Rating.countDocuments(), edges: await TrustEdge.countDocuments(), offers: await Quote.countDocuments(), jobs: await Job.countDocuments()
  };
  const done = await cleanOrphans();
  assert.deepEqual(done.counts, dry.counts);
  assert.deepEqual(await referencesTo(ghost._id), { ratings: 0, trustEdges: 0, offers: 0, jobs: 0, referredBy: 0, ledger: 0 });
  assert.deepEqual({
    ratings: await Rating.countDocuments(), edges: await TrustEdge.countDocuments(), offers: await Quote.countDocuments(), jobs: await Job.countDocuments()
  }, { ratings: counts.ratings - 1, edges: counts.edges - 2, offers: counts.offers - 2, jobs: counts.jobs });
  assert.equal((await Job.findById(settledJob._id).lean()).worker, null);
  assert.deepEqual((await Quote.find({ job: ghostJobFor._id }).lean()).map(q => String(q.worker)), [String(users.invited._id)]);
  // Run again: nothing left.
  assert.equal((await cleanOrphans({ dryRun: true })).missingUsers, 0);
});

test('scripts/cleanOrphans.js refuses to change anything without --confirm', { skip }, async () => {
  await assert.rejects(
    run('node', ['scripts/cleanOrphans.js'], { cwd: SERVER_DIR, env: { ...process.env, MONGO_URI: MONGO } }),
    err => err.code === 1 && /Refusing to change anything without --confirm/.test(err.stderr)
  );
});
