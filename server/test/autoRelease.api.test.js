// FR-13, automatic release: AUTO_RELEASE_AFTER_MS after the worker marks a
// job done, with no confirmation and no dispute, the escrow is released to
// the worker exactly as a confirmation would release it. The clock is moved
// with clock.js setNow instead of waiting. Needs TEST_MONGO_URI.
import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { AUTO_RELEASE_AFTER_MS, AUTO_RELEASE_CHECK_EVERY_MS } from '../config/autoRelease.js';
import { setNow } from '../modules/clock.js';

const MONGO = process.env.TEST_MONGO_URI && (() => {
  const url = new URL(process.env.TEST_MONGO_URI);
  url.pathname += '_autorelease';
  return url.toString();
})();
const skip = !MONGO && 'set TEST_MONGO_URI to run API tests';
const DETAILS = 'The tap still leaks after the repair was finished.';
const MINUTE = 60 * 1000;

let server, base, mongoose, Job, Transaction, Rating, users, tokens, fake;
let setPaymentProvider, createFakeProvider, releaseDueJobs;

before(async () => {
  if (skip) return;
  if (!/test/i.test(MONGO)) throw new Error('TEST_MONGO_URI must point at a database with "test" in its name');
  process.env.SESSION_SECRET = 'api-test-secret';

  mongoose = (await import('mongoose')).default;
  const { default: User } = await import('../modules/users/user.model.js');
  ({ default: Job } = await import('../modules/jobs/job.model.js'));
  ({ default: Transaction } = await import('../modules/payments/transaction.model.js'));
  ({ default: Rating } = await import('../modules/trust/rating.model.js'));
  ({ createFakeProvider } = await import('../modules/payments/providers/fake.js'));
  ({ setPaymentProvider } = await import('../modules/payments/providers/index.js'));
  ({ releaseDueJobs } = await import('../modules/payments/autoRelease.js'));
  const { createSessionToken } = await import('../modules/auth/session.js');
  const { default: app } = await import('../app.js');

  await mongoose.connect(MONGO);
  await mongoose.connection.dropDatabase();
  await Promise.all([User, Job, Transaction, Rating].map(M => M.createIndexes()));
  const created = await User.create([
    { name: 'Clara Mukamana', phone: '0788660001', role: 'client', area: 'remera' },
    { name: 'Walter Niyonzima', phone: '0788660002', role: 'worker', area: 'remera', skills: ['plumber'] },
    { name: 'Sam Stranger', phone: '0788660003', role: 'client', area: 'remera' }
  ]);
  users = { client: created[0], worker: created[1], stranger: created[2] };
  tokens = {};
  for (const [key, u] of Object.entries(users)) tokens[key] = createSessionToken(await User.findById(u._id).select('+sessionVersion'));
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (skip) return;
  server.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

beforeEach(async () => {
  if (skip) return;
  fake = createFakeProvider();
  setPaymentProvider(fake);
  await Promise.all([Job.deleteMany({}), Transaction.deleteMany({}), Rating.deleteMany({})]);
});
afterEach(() => setNow());

async function call(method, path, { as, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(as ? { authorization: `Bearer ${tokens[as]}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const post = (path, as, body) => call('POST', path, { as, body });
const page = job => call('GET', `/api/jobs/${job._id}`, { as: 'client' });

// A job paid into escrow, started and marked done by the worker, through the
// API (workerCompletedAt is the real time now).
async function awaitingJob() {
  const job = await Job.create({
    client: users.client._id, worker: users.worker._id, category: 'plumber', area: 'remera', description: 'Fix the kitchen tap',
    proposedPrice: 15000, agreedPrice: 15000, status: 'quote_accepted', acceptedAt: new Date()
  });
  assert.equal((await post(`/api/jobs/${job._id}/fund`, 'client')).status, 200);
  assert.equal((await post(`/api/jobs/${job._id}/start`, 'worker')).status, 200);
  assert.equal((await post(`/api/jobs/${job._id}/complete`, 'worker')).status, 200);
  return Job.findById(job._id).lean();
}
// Moves the clock to `ms` after the job was marked done.
const at = (job, ms) => setNow(() => new Date(job.workerCompletedAt.getTime() + ms));
const transfers = () => fake.calls.filter(c => c.op === 'transfer');
const paidOut = () => [...fake.records.entries()].filter(([key, r]) => key.startsWith('disbursement:') && r.status === 'SUCCESSFUL');
const ledger = job => Transaction.find({ job: job._id }).sort({ createdAt: 1, _id: 1 }).lean();
const reload = job => Job.findById(job._id).lean();

test('the window is 72 hours and the server checks every 15 minutes', () => {
  assert.equal(AUTO_RELEASE_AFTER_MS, 72 * 60 * 60 * 1000);
  assert.equal(AUTO_RELEASE_CHECK_EVERY_MS, 15 * 60 * 1000);
});

test('not released a minute before the deadline; released, recorded as automatic, a minute after', { skip }, async () => {
  const job = await awaitingJob();
  const deadline = new Date(job.workerCompletedAt.getTime() + AUTO_RELEASE_AFTER_MS).toISOString();

  at(job, AUTO_RELEASE_AFTER_MS - MINUTE);
  // Inside the last 24 hours: not released yet, but the client is reminded (releaseReminder.js).
  assert.deepEqual(await releaseDueJobs(), { inFlight: 0, due: 0, released: 0, failed: 0, reminded: 1 });
  const waiting = await page(job);
  assert.equal(waiting.data.status, 'awaiting_confirmation');
  assert.equal(waiting.data.autoReleaseAt, deadline);
  assert.equal((await call('GET', `/api/jobs/${job._id}`, { as: 'worker' })).data.autoReleaseAt, deadline);
  assert.equal((await call('GET', `/api/jobs/${job._id}`, { as: 'stranger' })).data.autoReleaseAt, null);
  assert.equal(transfers().length, 0);

  at(job, AUTO_RELEASE_AFTER_MS + MINUTE);
  assert.deepEqual(await releaseDueJobs(), { inFlight: 0, due: 1, released: 1, failed: 0, reminded: 0 });
  const done = await reload(job);
  assert.equal(done.status, 'completed');
  assert.equal(done.escrow.status, 'released');
  assert.equal(done.autoReleased, true);
  assert.ok(done.completedAt && done.escrow.releasedAt);

  // The same payout a confirmation makes: one transfer to the worker of the
  // escrowed amount, under the movement's idempotency key.
  assert.equal(transfers().length, 1);
  assert.deepEqual(
    { amount: transfers()[0].amount, party: transfers()[0].party, ref: transfers()[0].referenceId },
    { amount: 15000, party: { role: 'worker', userId: String(users.worker._id) }, ref: done.escrow.releaseRef }
  );
  const entries = (await ledger(job)).filter(e => e.event.startsWith('release_'));
  assert.deepEqual(entries.map(e => [e.event, e.actorRole, e.providerRef]), [
    ['release_requested', 'system', done.escrow.releaseRef],
    ['release_succeeded', 'system', done.escrow.releaseRef]
  ]);
  assert.match(entries[0].reason, /released automatically 72 hours after the work was marked done/);
  assert.equal(entries[0].actor ?? null, null);

  // Transactions: both parties see it as automatic; the job page has no deadline any more.
  for (const as of ['client', 'worker']) {
    const rows = (await call('GET', '/api/transactions', { as })).data.transactions.filter(r => r.type !== 'paid_in');
    assert.deepEqual(rows.map(r => [r.type, r.status, r.automatic]), [[as === 'client' ? 'released' : 'received', 'completed', true]]);
  }
  const fundRow = (await call('GET', '/api/transactions', { as: 'client' })).data.transactions.find(r => r.type === 'paid_in');
  assert.equal(fundRow.automatic, false);
  assert.equal((await page(job)).data.autoReleaseAt, null);
});

test('opening a due job\'s page releases it, for either party; a stranger opening it does not', { skip }, async () => {
  const first = await awaitingJob();
  const second = await awaitingJob();
  at(first, AUTO_RELEASE_AFTER_MS + MINUTE);

  const seen = await call('GET', `/api/jobs/${first._id}`, { as: 'stranger' });
  assert.equal(seen.data.status, 'awaiting_confirmation');
  assert.equal(transfers().length, 0);

  const byWorker = await call('GET', `/api/jobs/${first._id}`, { as: 'worker' });
  assert.equal(byWorker.data.status, 'completed');
  assert.equal(byWorker.data.escrow.status, 'released');
  const byClient = await page(second);
  assert.equal(byClient.data.status, 'completed');
  assert.equal(transfers().length, 2);
});

test('a problem reported before the deadline stops the release', { skip }, async () => {
  const job = await awaitingJob();
  at(job, AUTO_RELEASE_AFTER_MS - MINUTE);
  assert.equal((await post(`/api/jobs/${job._id}/dispute`, 'client', { reason: 'not_done', details: DETAILS })).status, 200);

  at(job, AUTO_RELEASE_AFTER_MS + 10 * AUTO_RELEASE_AFTER_MS);
  assert.equal((await releaseDueJobs()).released, 0);
  const res = await page(job);
  assert.equal(res.data.status, 'disputed');
  assert.equal(res.data.escrow.status, 'held');
  assert.equal(res.data.autoReleaseAt, null);
  assert.equal(transfers().length, 0);
});

test('two checks and two page reads at the same moment release once', { skip }, async () => {
  const job = await awaitingJob();
  at(job, AUTO_RELEASE_AFTER_MS + MINUTE);
  const results = await Promise.all([
    releaseDueJobs(),
    releaseDueJobs(),
    page(job),
    call('GET', `/api/jobs/${job._id}`, { as: 'worker' })
  ]);
  assert.equal(results[0].released + results[1].released <= 1, true);
  assert.equal(transfers().length, 1);
  assert.equal(paidOut().length, 1);
  const events = (await ledger(job)).map(e => e.event).filter(e => e.startsWith('release_'));
  assert.deepEqual(events, ['release_requested', 'release_succeeded']);
  assert.equal((await reload(job)).escrow.status, 'released');
});

test('a refused payout puts the job back and the next check retries it, paying once', { skip }, async () => {
  const job = await awaitingJob();
  at(job, AUTO_RELEASE_AFTER_MS + MINUTE);
  fake.failNext('transfer', 'refuse');
  assert.deepEqual(await releaseDueJobs(), { inFlight: 0, due: 1, released: 0, failed: 1, reminded: 0 });
  const back = await reload(job);
  assert.equal(back.status, 'awaiting_confirmation');
  assert.equal(back.escrow.status, 'held');
  assert.equal(back.autoReleased, false);
  assert.equal(back.escrow.lastFailure.kind, 'release');

  assert.deepEqual(await releaseDueJobs(), { inFlight: 0, due: 1, released: 1, failed: 0, reminded: 0 });
  assert.equal((await reload(job)).escrow.status, 'released');
  const refs = transfers().map(t => t.referenceId);
  assert.equal(refs.length, 2);
  assert.notEqual(refs[0], refs[1]); // a new idempotency key for the new attempt
  assert.equal(paidOut().length, 1);
  assert.deepEqual((await ledger(job)).map(e => e.event).filter(e => e.startsWith('release_')),
    ['release_requested', 'release_failed', 'release_requested', 'release_succeeded']);
});

test('a payout whose outcome is unknown is checked first, never started again while it may still arrive', { skip }, async () => {
  const job = await awaitingJob();
  at(job, AUTO_RELEASE_AFTER_MS + MINUTE);
  fake.failNext('transfer', 'pending'); // accepted; the provider hasn't finished
  await releaseDueJobs();
  assert.equal((await reload(job)).escrow.status, 'releasing');

  // Still in flight: the next check asks the provider and starts nothing new.
  assert.deepEqual(await releaseDueJobs(), { inFlight: 1, due: 0, released: 0, failed: 0, reminded: 0 });
  assert.equal(transfers().length, 1);

  fake.settle('disbursement', transfers()[0].referenceId, 'SUCCESSFUL');
  assert.deepEqual(await releaseDueJobs(), { inFlight: 1, due: 0, released: 0, failed: 0, reminded: 0 });
  const done = await reload(job);
  assert.equal(done.status, 'completed');
  assert.equal(done.escrow.status, 'released');
  assert.equal(transfers().length, 1);
});

test('ratings open after an automatic release, exactly as after a confirmation', { skip }, async () => {
  const job = await awaitingJob();
  at(job, AUTO_RELEASE_AFTER_MS + MINUTE);
  await releaseDueJobs();

  const workerRates = await post(`/api/jobs/${job._id}/rate-client`, 'worker', { score: 4 });
  assert.equal(workerRates.status, 201);
  // The client's confirm-and-rate request now only rates: nothing is paid again.
  const clientRates = await post(`/api/jobs/${job._id}/confirm`, 'client', { score: 5, referred: true });
  assert.equal(clientRates.status, 200);
  assert.equal(clientRates.data.myRating.score, 5);
  assert.equal(await Rating.countDocuments({ job: job._id }), 2);
  assert.equal(transfers().length, 1);
});

test('the client confirming before the deadline works as before, and nothing is released again later', { skip }, async () => {
  const job = await awaitingJob();
  at(job, 60 * MINUTE);
  const res = await post(`/api/jobs/${job._id}/confirm`, 'client', { score: 5 });
  assert.equal(res.status, 200);
  assert.equal(res.data.job.autoReleased, false);
  const requested = (await ledger(job)).find(e => e.event === 'release_requested');
  assert.equal(requested.actorRole, 'client');

  at(job, AUTO_RELEASE_AFTER_MS + MINUTE);
  assert.equal((await releaseDueJobs()).released, 0);
  assert.equal(transfers().length, 1);
  const rows = (await call('GET', '/api/transactions', { as: 'client' })).data.transactions.filter(r => r.type === 'released');
  assert.equal(rows[0].automatic, false);
});

test('the client confirming at the same moment as the automatic release: paid once, and the rating is kept', { skip }, async () => {
  for (let round = 0; round < 5; round++) {
    const job = await awaitingJob();
    at(job, AUTO_RELEASE_AFTER_MS + MINUTE);
    const before = transfers().length;
    const [confirm] = await Promise.all([post(`/api/jobs/${job._id}/confirm`, 'client', { score: 5 }), releaseDueJobs()]);
    assert.ok([200, 202].includes(confirm.status), `round ${round}: ${JSON.stringify(confirm)}`);
    if (confirm.status === 202) assert.equal((await post(`/api/jobs/${job._id}/confirm`, 'client', { score: 5 })).status, 200);
    assert.equal(transfers().length, before + 1, `round ${round}`);
    assert.equal(await Rating.countDocuments({ job: job._id, fromUser: users.client._id }), 1);
    assert.equal((await reload(job)).escrow.status, 'released');
  }
});
