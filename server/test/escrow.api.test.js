// API tests for sandbox escrow, with the fake payment provider. Like the other
// *.api.test.js files they run the real app against a throwaway database (a
// one-node replica set, for transactions) and are skipped unless
// TEST_MONGO_URI is set.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Its own database: node --test runs files in parallel.
const MONGO = process.env.TEST_MONGO_URI && (() => {
  const url = new URL(process.env.TEST_MONGO_URI);
  url.pathname += '_escrow';
  return url.toString();
})();
const skip = !MONGO && 'set TEST_MONGO_URI to run API tests';

const ADMIN_SECRET = 'escrow-test-admin-secret';
let server, base, mongoose, Job, Rating, TrustEdge, Transaction, users, tokens, fake, createFakeProvider, setPaymentProvider;

before(async () => {
  if (skip) return;
  if (!/test/i.test(MONGO)) throw new Error('TEST_MONGO_URI must point at a database with "test" in its name');
  process.env.SESSION_SECRET = 'api-test-secret';
  process.env.ADMIN_SECRET = ADMIN_SECRET;

  mongoose = (await import('mongoose')).default;
  const { default: User } = await import('../modules/users/user.model.js');
  ({ default: Job } = await import('../modules/jobs/job.model.js'));
  ({ default: Rating } = await import('../modules/trust/rating.model.js'));
  ({ default: TrustEdge } = await import('../modules/trust/trustEdge.model.js'));
  ({ default: Transaction } = await import('../modules/payments/transaction.model.js'));
  ({ createFakeProvider } = await import('../modules/payments/providers/fake.js'));
  ({ setPaymentProvider } = await import('../modules/payments/providers/index.js'));
  const { createSessionToken } = await import('../modules/auth/session.js');
  const { default: app } = await import('../app.js');

  await mongoose.connect(MONGO);
  await mongoose.connection.dropDatabase();
  await Promise.all([User, Job, Rating, TrustEdge, Transaction].map(M => M.createIndexes()));
  const [client, worker, stranger] = await User.create([
    { name: 'Client Esc', phone: '0788400001', role: 'client', area: 'remera' },
    { name: 'Worker Esc', phone: '0788400002', role: 'worker', area: 'remera', skills: ['plumber'] },
    { name: 'Stranger Esc', phone: '0788400003', role: 'client', area: 'remera' }
  ]);
  users = { client, worker, stranger };
  tokens = Object.fromEntries(await Promise.all(Object.entries(users).map(async ([k, u]) => {
    const full = await User.findById(u._id).select('+sessionVersion');
    return [k, createSessionToken(full)];
  })));
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (skip) return;
  server.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

// A fresh fake provider for every test, so its records belong to that test.
beforeEach(() => {
  if (skip) return;
  fake = createFakeProvider();
  setPaymentProvider(fake);
});

const call = async (method, path, { as, body, headers = {} } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(as ? { authorization: `Bearer ${tokens[as]}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};
const post = (path, as, body) => call('POST', path, { as, body });
const admin = (method, path) => call(method, path, { headers: { 'x-admin-secret': ADMIN_SECRET } });

const acceptedJob = () => Job.create({
  client: users.client._id, worker: users.worker._id, category: 'plumber', area: 'remera',
  description: 'Fix sink', proposedPrice: 15000, agreedPrice: 15000, status: 'quote_accepted', acceptedAt: new Date()
});
const ledger = async jobId => (await Transaction.find({ job: jobId }).sort({ createdAt: 1, _id: 1 }).lean()).map(t => t.event);
const reload = id => Job.findById(id).lean();

// Funded and taken to awaiting confirmation through the API.
const awaitingJob = async () => {
  const job = await acceptedJob();
  assert.equal((await post(`/api/jobs/${job._id}/fund`, 'client')).status, 200);
  assert.equal((await post(`/api/jobs/${job._id}/start`, 'worker')).status, 200);
  assert.equal((await post(`/api/jobs/${job._id}/complete`, 'worker')).status, 200);
  return job;
};

// 1. Each transition

test('fund: quote_accepted -> escrow_held, one collection call keyed by the job\'s fund reference, two ledger records', { skip }, async () => {
  const job = await acceptedJob();
  const res = await post(`/api/jobs/${job._id}/fund`, 'client');
  assert.equal(res.status, 200);
  assert.equal(res.data.status, 'escrow_held');
  assert.equal(res.data.escrow.status, 'held');
  assert.equal(res.data.escrow.amount, 15000);
  assert.equal(res.data.escrow.pending, null);

  const pays = fake.calls.filter(c => c.op === 'requestToPay');
  assert.equal(pays.length, 1);
  assert.equal(pays[0].referenceId, res.data.escrow.fundRef);
  assert.deepEqual(pays[0].party, { role: 'client', userId: String(users.client._id) });
  assert.deepEqual(await ledger(job._id), ['fund_requested', 'fund_succeeded']);
  const records = await Transaction.find({ job: job._id }).lean();
  assert.ok(records.every(r => r.providerRef === res.data.escrow.fundRef && r.amount === 15000 && r.provider === 'fake'));
});

test('only the job\'s client can fund, and only once a worker is chosen', { skip }, async () => {
  const job = await acceptedJob();
  assert.equal((await post(`/api/jobs/${job._id}/fund`, 'stranger')).status, 403);
  assert.equal((await post(`/api/jobs/${job._id}/fund`, 'worker')).status, 403);
  const open = await Job.create({ client: users.client._id, category: 'plumber', area: 'remera', description: 'Open', proposedPrice: 5000 });
  assert.equal((await post(`/api/jobs/${open._id}/fund`, 'client')).status, 409);
  assert.equal(fake.calls.length, 0);
});

test('the worker can start only after escrow is funded', { skip }, async () => {
  const job = await acceptedJob();
  const early = await post(`/api/jobs/${job._id}/start`, 'worker');
  assert.equal(early.status, 409);
  assert.match(early.data.error, /quote accepted/);
  await post(`/api/jobs/${job._id}/fund`, 'client');
  assert.equal((await post(`/api/jobs/${job._id}/start`, 'worker')).data.status, 'in_progress');
});

test('confirm releases escrow to the worker, then stores the rating and trust edge', { skip }, async () => {
  const job = await awaitingJob();
  const res = await post(`/api/jobs/${job._id}/confirm`, 'client', { score: 5, referred: true });
  assert.equal(res.status, 200);
  assert.equal(res.data.job.status, 'completed');
  assert.equal(res.data.job.escrow.status, 'released');
  assert.equal(res.data.myRating.score, 5);

  const transfers = fake.calls.filter(c => c.op === 'transfer');
  assert.equal(transfers.length, 1);
  assert.equal(transfers[0].referenceId, res.data.job.escrow.releaseRef);
  assert.deepEqual(transfers[0].party, { role: 'worker', userId: String(users.worker._id) });
  assert.equal(transfers[0].amount, 15000);
  assert.deepEqual(await ledger(job._id), ['fund_requested', 'fund_succeeded', 'release_requested', 'release_succeeded']);
  assert.equal(await Rating.countDocuments({ job: job._id, fromUser: users.client._id }), 1);
});

test('dispute locks escrow; an admin refund resolves it and repays the client', { skip }, async () => {
  const job = await acceptedJob();
  await post(`/api/jobs/${job._id}/fund`, 'client');
  assert.equal((await post(`/api/jobs/${job._id}/dispute`, 'worker')).data.status, 'disputed');

  // locked: no start, no confirm, no rating
  assert.equal((await post(`/api/jobs/${job._id}/start`, 'worker')).status, 409);
  assert.equal((await post(`/api/jobs/${job._id}/confirm`, 'client', { score: 4 })).status, 409);
  assert.equal(fake.calls.filter(c => c.op === 'transfer').length, 0);

  const res = await admin('POST', `/api/admin/jobs/${job._id}/refund`);
  assert.equal(res.status, 200);
  assert.equal(res.data.status, 'resolved');
  assert.equal(res.data.escrow.status, 'refunded');
  const [refund] = fake.calls.filter(c => c.op === 'transfer');
  assert.deepEqual(refund.party, { role: 'client', userId: String(users.client._id) });
  assert.deepEqual(await ledger(job._id), ['fund_requested', 'fund_succeeded', 'dispute_opened', 'refund_requested', 'refund_succeeded']);
  // settled once: neither outcome can run again
  assert.equal((await admin('POST', `/api/admin/jobs/${job._id}/release`)).status, 409);
  assert.equal((await admin('POST', `/api/admin/jobs/${job._id}/refund`)).status, 409);
  assert.equal(fake.calls.filter(c => c.op === 'transfer').length, 1);
});

test('an admin release resolves a dispute raised after the work was marked done', { skip }, async () => {
  const job = await awaitingJob();
  assert.equal((await post(`/api/jobs/${job._id}/dispute`, 'client')).status, 200);
  const res = await admin('POST', `/api/admin/jobs/${job._id}/release`);
  assert.equal(res.status, 200);
  assert.equal(res.data.status, 'resolved');
  assert.equal(res.data.escrow.status, 'released');
  assert.deepEqual((await admin('GET', `/api/admin/jobs/${job._id}/ledger`)).data.map(t => t.event),
    ['fund_requested', 'fund_succeeded', 'dispute_opened', 'release_requested', 'release_succeeded']);
  assert.deepEqual((await admin('GET', '/api/admin/disputes')).data.map(j => String(j._id)).includes(String(job._id)), false);
});

test('admin routes need the shared secret', { skip }, async () => {
  const job = await acceptedJob();
  assert.equal((await call('POST', `/api/admin/jobs/${job._id}/refund`)).status, 401);
  assert.equal((await call('POST', `/api/admin/jobs/${job._id}/refund`, { headers: { 'x-admin-secret': 'wrong' } })).status, 401);
  assert.equal((await call('POST', `/api/admin/jobs/${job._id}/refund`, { as: 'client' })).status, 401);
});

// 2. Double funding and double release

test('double funding: two simultaneous fund requests charge once', { skip }, async () => {
  const job = await acceptedJob();
  const results = await Promise.all([post(`/api/jobs/${job._id}/fund`, 'client'), post(`/api/jobs/${job._id}/fund`, 'client')]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal(fake.records.size, 1);
  assert.equal(fake.calls.filter(c => c.op === 'requestToPay').length, 1);
  // and once more, later
  const again = await post(`/api/jobs/${job._id}/fund`, 'client');
  assert.equal(again.status, 409);
  assert.equal(again.data.error, 'This job is already paid into escrow');
  assert.deepEqual(await ledger(job._id), ['fund_requested', 'fund_succeeded']);
});

test('double release: two simultaneous confirms pay the worker once and rate once', { skip }, async () => {
  const job = await awaitingJob();
  const edges = () => TrustEdge.countDocuments({ fromUser: users.client._id, toUser: users.worker._id });
  const edgesBefore = await edges();
  const results = await Promise.all([
    post(`/api/jobs/${job._id}/confirm`, 'client', { score: 5 }),
    post(`/api/jobs/${job._id}/confirm`, 'client', { score: 5 })
  ]);
  assert.ok(results.some(r => r.status === 200), JSON.stringify(results));
  assert.ok(results.every(r => r.status === 200 || r.status === 409), JSON.stringify(results));
  assert.equal(fake.calls.filter(c => c.op === 'transfer').length, 1);
  assert.equal(await Rating.countDocuments({ job: job._id, fromUser: users.client._id }), 1);
  assert.equal(await edges(), edgesBefore + 1);
  // a later confirm releases nothing more
  assert.equal((await post(`/api/jobs/${job._id}/confirm`, 'client', { score: 5 })).status, 409);
  assert.deepEqual((await ledger(job._id)).filter(e => e.startsWith('release')), ['release_requested', 'release_succeeded']);
});

test('the same reference sent twice to the provider moves money once', { skip }, async () => {
  const ref = '3f1c2b9a-6d7e-4f80-9a1b-2c3d4e5f6a7b';
  const request = { referenceId: ref, amount: 100, currency: 'RWF', externalId: 'x', party: { role: 'client', userId: 'u' } };
  assert.deepEqual(await fake.requestToPay(request), { accepted: true, duplicate: false });
  assert.deepEqual(await fake.requestToPay(request), { accepted: true, duplicate: true });
  assert.equal(fake.records.size, 1);
});

// 3. Failed provider calls

test('a refused fund call charges nothing, puts the job back, and a retry uses a new reference', { skip }, async () => {
  const job = await acceptedJob();
  fake.failNext('requestToPay', 'refuse');
  const failed = await post(`/api/jobs/${job._id}/fund`, 'client');
  assert.equal(failed.status, 502);
  assert.match(failed.data.error, /Nothing was charged/);
  const after = await reload(job._id);
  assert.equal(after.status, 'quote_accepted');
  assert.equal(after.escrow.status, 'none');
  assert.equal(after.escrow.pending, null);
  assert.equal(fake.records.size, 0);
  assert.deepEqual(await ledger(job._id), ['fund_requested', 'fund_failed']);

  const retried = await post(`/api/jobs/${job._id}/fund`, 'client');
  assert.equal(retried.status, 200);
  assert.notEqual(retried.data.escrow.fundRef, after.escrow.fundRef);
  assert.deepEqual(await ledger(job._id), ['fund_requested', 'fund_failed', 'fund_requested', 'fund_succeeded']);
});

test('a refused payout keeps the money held, leaves the job unconfirmed and unrated, and a retry works', { skip }, async () => {
  const job = await awaitingJob();
  fake.failNext('transfer', 'refuse');
  const failed = await post(`/api/jobs/${job._id}/confirm`, 'client', { score: 4 });
  assert.equal(failed.status, 502);
  assert.match(failed.data.error, /still held/);
  const after = await reload(job._id);
  assert.equal(after.status, 'awaiting_confirmation');
  assert.equal(after.escrow.status, 'held');
  assert.equal(after.completedAt, null);
  assert.equal(await Rating.countDocuments({ job: job._id }), 0);

  const retried = await post(`/api/jobs/${job._id}/confirm`, 'client', { score: 4 });
  assert.equal(retried.status, 200);
  assert.equal(retried.data.job.escrow.status, 'released');
  assert.deepEqual((await ledger(job._id)).slice(2), ['release_requested', 'release_failed', 'release_requested', 'release_succeeded']);
});

test('a payment the payer declines (FAILED status) puts the job back', { skip }, async () => {
  const job = await acceptedJob();
  fake.failNext('requestToPay', 'fail');
  const res = await post(`/api/jobs/${job._id}/fund`, 'client');
  assert.equal(res.status, 200);
  assert.equal(res.data.status, 'quote_accepted');
  assert.equal(res.data.escrow.status, 'none');
  const failure = await Transaction.findOne({ job: job._id, event: 'fund_failed' }).lean();
  assert.equal(failure.reason, 'fake payer declined');
});

test('a fund call that times out stays pending; polling finds it never arrived and puts the job back', { skip }, async () => {
  const job = await acceptedJob();
  fake.failNext('requestToPay', 'timeout');
  const res = await post(`/api/jobs/${job._id}/fund`, 'client');
  assert.equal(res.status, 202);
  assert.equal(res.data.escrow.status, 'funding');
  const synced = await post(`/api/jobs/${job._id}/escrow/sync`, 'client');
  assert.equal(synced.data.escrow.status, 'none');
  assert.deepEqual(await ledger(job._id), ['fund_requested', 'fund_failed']);
});

test('a provider that cannot be reached while polling changes nothing', { skip }, async () => {
  const job = await acceptedJob();
  fake.failNext('requestToPay', 'pending');
  await post(`/api/jobs/${job._id}/fund`, 'client');
  fake.failNext('getStatus', 'timeout');
  assert.equal((await post(`/api/jobs/${job._id}/escrow/sync`, 'worker')).data.escrow.status, 'funding');
  assert.deepEqual(await ledger(job._id), ['fund_requested']);
});

// 4. Pending payments, callbacks and polling

test('a pending payment settles by callback; repeated and forged callbacks change nothing', { skip }, async () => {
  const job = await acceptedJob();
  fake.failNext('requestToPay', 'pending');
  const res = await post(`/api/jobs/${job._id}/fund`, 'client');
  assert.equal(res.status, 202);
  const ref = res.data.escrow.pending.ref;
  assert.equal((await post(`/api/jobs/${job._id}/start`, 'worker')).status, 409);

  // a callback before the payer approves: still pending
  assert.equal((await call('PUT', `/api/payments/momo/callback?ref=${ref}`, { body: { status: 'SUCCESSFUL' } })).status, 200);
  assert.equal((await reload(job._id)).escrow.status, 'funding');

  fake.settle('collection', ref, 'SUCCESSFUL');
  await call('PUT', `/api/payments/momo/callback?ref=${ref}`);
  await call('POST', `/api/payments/momo/callback?ref=${ref}`);
  assert.equal((await reload(job._id)).status, 'escrow_held');
  assert.deepEqual(await ledger(job._id), ['fund_requested', 'fund_succeeded']);
  assert.equal((await call('POST', '/api/payments/momo/callback?ref=not-a-ref')).status, 200);
});

test('polling: only the job\'s parties can sync, and it settles a declined payment', { skip }, async () => {
  const job = await acceptedJob();
  fake.failNext('requestToPay', 'pending');
  const { data } = await post(`/api/jobs/${job._id}/fund`, 'client');
  assert.equal((await post(`/api/jobs/${job._id}/escrow/sync`, 'stranger')).status, 404);
  fake.settle('collection', data.escrow.pending.ref, 'FAILED', 'APPROVAL_REJECTED');
  const synced = await post(`/api/jobs/${job._id}/escrow/sync`, 'client');
  assert.equal(synced.data.status, 'quote_accepted');
  assert.equal(synced.data.escrow.status, 'none');
});

// 5. Ratings need the job confirmed AND escrow released

test('while the payout is pending nobody can rate; once released, the same confirm request rates', { skip }, async () => {
  const job = await awaitingJob();
  fake.failNext('transfer', 'pending');
  const pending = await post(`/api/jobs/${job._id}/confirm`, 'client', { score: 5 });
  assert.equal(pending.status, 202);
  assert.equal(pending.data.myRating, null);
  assert.equal(pending.data.job.status, 'completed');
  assert.equal(pending.data.job.escrow.status, 'releasing');
  assert.equal((await post(`/api/jobs/${job._id}/rate-client`, 'worker', { score: 5 })).status, 409);
  assert.equal(await Rating.countDocuments({ job: job._id }), 0);

  fake.settle('disbursement', pending.data.job.escrow.pending.ref, 'SUCCESSFUL');
  const rated = await post(`/api/jobs/${job._id}/confirm`, 'client', { score: 5 });
  assert.equal(rated.status, 200);
  assert.equal(rated.data.job.escrow.status, 'released');
  const mine = async as => (await call('GET', '/api/jobs/mine', { as })).data.find(j => String(j._id) === String(job._id));
  assert.equal((await mine('client')).rated, true);
  assert.equal((await mine('worker')).rated, false);
  assert.equal((await post(`/api/jobs/${job._id}/rate-client`, 'worker', { score: 5 })).status, 201);
  assert.equal((await mine('worker')).rated, true);
  assert.equal(fake.calls.filter(c => c.op === 'transfer').length, 1);
});

test('the worker can no longer rate the client before confirmation and release', { skip }, async () => {
  const job = await awaitingJob();
  const res = await post(`/api/jobs/${job._id}/rate-client`, 'worker', { score: 3 });
  assert.equal(res.status, 409);
  assert.match(res.data.error, /confirmed the job and the payment has been released/);
});

test('a disputed job cannot be rated, even after it is resolved', { skip }, async () => {
  const job = await awaitingJob();
  await post(`/api/jobs/${job._id}/dispute`, 'worker');
  await admin('POST', `/api/admin/jobs/${job._id}/release`);
  assert.equal((await post(`/api/jobs/${job._id}/rate-client`, 'worker', { score: 2 })).status, 409);
  assert.equal((await post(`/api/jobs/${job._id}/confirm`, 'client', { score: 2 })).status, 409);
  assert.equal(await Rating.countDocuments({ job: job._id }), 0);
});

test('the ledger stores no phone numbers or names', { skip }, async () => {
  const job = await awaitingJob();
  await post(`/api/jobs/${job._id}/confirm`, 'client', { score: 5 });
  const text = JSON.stringify(await Transaction.find({ job: job._id }).lean());
  for (const s of ['0788400001', '0788400002', '788400001', 'Client Esc', 'Worker Esc']) assert.equal(text.includes(s), false);
});
