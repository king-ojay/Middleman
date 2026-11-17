// The active-job limit (config/workload.js, modules/jobs/workload.js): which
// jobs count, refusing offers from a worker at the limit and choosing them,
// and both allowed again once a job is confirmed or refunded. The offers list
// marks a busy worker without changing the trust order, and two choices at
// the same moment can't take a worker past the limit, and an automatic
// release (FR-13) frees a place like a confirmation. Needs TEST_MONGO_URI.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_ACTIVE_JOBS } from '../config/workload.js';
import { AUTO_RELEASE_AFTER_MS } from '../config/autoRelease.js';
import { setNow } from '../modules/clock.js';
import { AT_LIMIT_MESSAGE, WORKER_BUSY_MESSAGE } from '../modules/jobs/workload.js';
import { POLICY_VERSION } from '../config/policy.shared.js';

const MONGO = process.env.TEST_MONGO_URI && (() => {
  const url = new URL(process.env.TEST_MONGO_URI);
  url.pathname += '_workload';
  return url.toString();
})();
const skip = !MONGO && 'set TEST_MONGO_URI to run API tests';
const ADMIN_SECRET = 'workload-test-admin-secret';
const DETAILS = 'The tap still leaks after the repair was finished.';

let server, base, mongoose, Job, ACTIVE_STATUSES, Quote, releaseDueJobs, users, tokens;

before(async () => {
  if (skip) return;
  if (!/test/i.test(MONGO)) throw new Error('TEST_MONGO_URI must point at a database with "test" in its name');
  process.env.SESSION_SECRET = 'api-test-secret';
  process.env.ADMIN_SECRET = ADMIN_SECRET;

  mongoose = (await import('mongoose')).default;
  const { default: User } = await import('../modules/users/user.model.js');
  ({ default: Job, ACTIVE_STATUSES } = await import('../modules/jobs/job.model.js'));
  ({ default: Quote } = await import('../modules/jobs/quote.model.js'));
  ({ releaseDueJobs } = await import('../modules/payments/autoRelease.js'));
  const { default: Transaction } = await import('../modules/payments/transaction.model.js');
  const { createFakeProvider } = await import('../modules/payments/providers/fake.js');
  const { setPaymentProvider } = await import('../modules/payments/providers/index.js');
  const { createSessionToken } = await import('../modules/auth/session.js');
  const { default: app } = await import('../app.js');

  await mongoose.connect(MONGO);
  await mongoose.connection.dropDatabase();
  await Promise.all([User, Job, Quote, Transaction].map(M => M.createIndexes()));
  const created = await User.create([
    { name: 'Clara Mukamana', phone: '0788640001', role: 'client', area: 'remera' },
    { name: 'Sam Stranger', phone: '0788640002', role: 'client', area: 'remera' },
    { name: 'Walter Niyonzima', phone: '0788640003', role: 'worker', area: 'remera', skills: ['plumber'] },
    { name: 'Olga Uwase', phone: '0788640004', role: 'worker', area: 'remera', skills: ['plumber'] },
    { name: 'Cyiza Habimana', phone: '0788640005', role: 'worker', area: 'remera', skills: ['plumber'] },
    { name: 'Diane Ingabire', phone: '0788640006', role: 'worker', area: 'remera', skills: ['plumber'] },
    { name: 'Eric Mugisha', phone: '0788640007', role: 'worker', area: 'remera', skills: ['plumber'] },
    { name: 'Grace Uwera', phone: '0788640008', role: 'client', area: 'remera' }
  ]);
  users = Object.fromEntries(['client', 'stranger', 'walter', 'olga', 'cyiza', 'diane', 'eric', 'grace'].map((k, i) => [k, created[i]]));
  tokens = {};
  // Created directly, not through sign-up: mark them as having agreed to the policy (requireUser).
  await User.updateMany({}, { policyVersion: POLICY_VERSION, consentedAt: new Date(), ageConfirmed: true });
  for (const [key, u] of Object.entries(users)) tokens[key] = createSessionToken(await User.findById(u._id).select('+sessionVersion'));
  setPaymentProvider(createFakeProvider());
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
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
const post = (path, as, body) => call('POST', path, { as, body });

const openJob = (description = 'Fix the kitchen tap', client = 'client') => Job.create({
  client: users[client]._id, category: 'plumber', area: 'remera', description, proposedPrice: 15000
});
// A job already given to `worker`, in `status` (written directly: the
// counting rule doesn't care how a job got there).
const assigned = (worker, status, extra = {}) => Job.create({
  client: users.client._id, worker: users[worker]._id, category: 'plumber', area: 'remera', description: `A ${status} job`,
  proposedPrice: 15000, agreedPrice: 15000, status, acceptedAt: new Date(), ...extra
});
// A job chosen for `worker` and paid into escrow, through the API.
async function heldJob(worker) {
  const job = await assigned(worker, 'quote_accepted');
  assert.equal((await post(`/api/jobs/${job._id}/fund`, 'client')).status, 200);
  return job;
}
const respond = (job, as, body = {}) => post(`/api/jobs/${job._id}/responses`, as, body);

test('the limit is 3, and only chosen-but-unfinished jobs (disputed included) count as active', { skip }, async () => {
  assert.equal(MAX_ACTIVE_JOBS, 3);
  assert.deepEqual(ACTIVE_STATUSES, ['quote_accepted', 'escrow_held', 'in_progress', 'awaiting_confirmation', 'disputed']);

  // Not active: confirmed, settled after a dispute either way, reopened, and
  // other workers' jobs.
  await assigned('diane', 'completed', { escrow: { status: 'released' } });
  await assigned('diane', 'resolved', { escrow: { status: 'released' } });
  await assigned('diane', 'resolved', { escrow: { status: 'refunded' } });
  await openJob('Reopened after the worker left');
  await assigned('olga', 'in_progress');
  let res = await call('GET', '/api/jobs/workload', { as: 'diane' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.data, { active: 0, limit: 3, atLimit: false, message: null });

  for (const status of ACTIVE_STATUSES) await assigned('diane', status);
  res = await call('GET', '/api/jobs/workload', { as: 'diane' });
  assert.deepEqual(res.data, { active: 5, limit: 3, atLimit: true, message: AT_LIMIT_MESSAGE });
  assert.equal(AT_LIMIT_MESSAGE, 'You have 3 jobs in progress. Finish one before taking another.');

  // Workers only.
  assert.equal((await call('GET', '/api/jobs/workload', { as: 'client' })).status, 403);
  await Job.deleteMany({ worker: users.diane._id });
});

test('at the limit a worker can browse but not accept or counter; confirming a job lets them again', { skip }, async () => {
  await assigned('walter', 'quote_accepted');
  await assigned('walter', 'in_progress');
  const finishing = await heldJob('walter');
  const job = await openJob();

  const feed = await call('GET', '/api/jobs/feed', { as: 'walter' });
  assert.equal(feed.status, 200);
  assert.ok(feed.data.some(j => String(j._id) === String(job._id)), 'the open job is still listed');

  for (const body of [{}, { amount: 18000 }]) {
    const res = await respond(job, 'walter', body);
    assert.equal(res.status, 409);
    assert.equal(res.data.error, AT_LIMIT_MESSAGE);
  }
  assert.equal(await Quote.countDocuments({ job: job._id }), 0);

  // Finish one: start, complete, and the client confirms (escrow released).
  assert.equal((await post(`/api/jobs/${finishing._id}/start`, 'walter')).status, 200);
  assert.equal((await post(`/api/jobs/${finishing._id}/complete`, 'walter')).status, 200);
  assert.equal((await post(`/api/jobs/${finishing._id}/confirm`, 'client', { score: 5 })).status, 200);
  assert.equal((await call('GET', '/api/jobs/workload', { as: 'walter' })).data.active, 2);

  assert.equal((await respond(job, 'walter')).status, 201);
  await Job.deleteMany({ worker: users.walter._id });
  await Job.deleteOne({ _id: job._id });
});

test('a disputed job counts until it is refunded; then the worker can respond again', { skip }, async () => {
  await assigned('cyiza', 'quote_accepted');
  await assigned('cyiza', 'awaiting_confirmation');
  const disputed = await heldJob('cyiza');
  assert.equal((await post(`/api/jobs/${disputed._id}/dispute`, 'client', { reason: 'not_done', details: DETAILS })).status, 200);
  const job = await openJob();

  const refused = await respond(job, 'cyiza');
  assert.equal(refused.status, 409);
  assert.equal(refused.data.error, AT_LIMIT_MESSAGE);

  const refund = await call('POST', `/api/admin/jobs/${disputed._id}/refund`, { admin: true });
  assert.equal(refund.status, 200);
  assert.equal(refund.data.status, 'resolved');
  assert.equal(refund.data.escrow.status, 'refunded');

  assert.equal((await respond(job, 'cyiza')).status, 201);
  await Job.deleteMany({ worker: users.cyiza._id });
  await Job.deleteOne({ _id: job._id });
});

test('an automatic release frees a place: the worker can then be chosen, and both parties can call', { skip }, async () => {
  await assigned('diane', 'quote_accepted');
  await assigned('diane', 'in_progress');
  const finishing = await heldJob('diane');
  assert.equal((await post(`/api/jobs/${finishing._id}/start`, 'diane')).status, 200);
  assert.equal((await post(`/api/jobs/${finishing._id}/complete`, 'diane')).status, 200);
  const job = await openJob();
  assert.equal((await respond(job, 'diane')).status, 409);

  // The client neither confirms nor reports a problem in time.
  const { workerCompletedAt } = await Job.findById(finishing._id).lean();
  setNow(() => new Date(workerCompletedAt.getTime() + AUTO_RELEASE_AFTER_MS));
  try {
    assert.equal((await releaseDueJobs()).released, 1);
  } finally {
    setNow();
  }
  const released = await Job.findById(finishing._id).lean();
  assert.equal(released.status, 'completed');
  assert.equal(released.autoReleased, true);
  assert.equal((await call('GET', '/api/jobs/workload', { as: 'diane' })).data.active, 2);

  // Choosing goes through the same check-and-set, and the chosen job's page
  // carries the phone numbers for the call button.
  assert.equal((await respond(job, 'diane')).status, 201);
  const quote = await Quote.findOne({ job: job._id, worker: users.diane._id }).lean();
  assert.equal((await post(`/api/jobs/${job._id}/select`, 'client', { quoteId: quote._id })).status, 200);
  assert.equal((await call('GET', '/api/jobs/workload', { as: 'diane' })).data.active, 3);
  const page = await call('GET', `/api/jobs/${job._id}`, { as: 'client' });
  assert.equal(page.data.otherPartyPhone, users.diane.phone);
  assert.equal(page.data.autoReleaseAt, null);
  assert.equal((await call('GET', `/api/jobs/${job._id}`, { as: 'diane' })).data.otherPartyPhone, users.client.phone);

  await Job.deleteMany({ worker: users.diane._id });
  await Quote.deleteMany({ worker: users.diane._id });
});

test('a busy worker is marked on the offers list in the same order, and choosing them is refused', { skip }, async () => {
  const job = await openJob();
  assert.equal((await respond(job, 'olga')).status, 201);
  assert.equal((await respond(job, 'walter', { amount: 14000 })).status, 201);
  const order = res => res.data.responses.map(r => String(r.worker._id));

  const before = await call('GET', `/api/jobs/${job._id}`, { as: 'client' });
  assert.ok(before.data.responses.every(r => r.busy === false));

  // Walter takes on three other jobs after sending his offer.
  for (const status of ['quote_accepted', 'escrow_held', 'disputed']) await assigned('walter', status);
  const after = await call('GET', `/api/jobs/${job._id}`, { as: 'client' });
  assert.deepEqual(order(after), order(before));
  const busy = Object.fromEntries(after.data.responses.map(r => [r.worker.name, r.busy]));
  assert.deepEqual(busy, { 'Olga Uwase': false, 'Walter Niyonzima': true });

  const walterQuote = after.data.responses.find(r => r.busy)._id;
  const refused = await post(`/api/jobs/${job._id}/select`, 'client', { quoteId: walterQuote });
  assert.equal(refused.status, 409);
  assert.equal(refused.data.error, WORKER_BUSY_MESSAGE);
  assert.equal((await Job.findById(job._id).lean()).status, 'open');
  assert.equal(await Quote.countDocuments({ job: job._id, status: 'pending' }), 2);

  // Another client is refused as before, without learning Walter is busy.
  const stranger = await post(`/api/jobs/${job._id}/select`, 'stranger', { quoteId: walterQuote });
  assert.equal(stranger.status, 403);

  const olgaQuote = after.data.responses.find(r => !r.busy)._id;
  assert.equal((await post(`/api/jobs/${job._id}/select`, 'client', { quoteId: olgaQuote })).status, 200);
  // Once a worker is chosen nobody is marked busy: there is nothing left to choose.
  const chosen = await call('GET', `/api/jobs/${job._id}`, { as: 'client' });
  assert.ok(chosen.data.responses.every(r => r.busy === false));
});

test('two clients choosing a worker with 2 active jobs at the same moment: exactly one succeeds', { skip }, async () => {
  const active = () => Job.countDocuments({ worker: users.eric._id, status: { $in: ACTIVE_STATUSES } });
  // Several rounds, so the two requests really do overlap at least once.
  for (let round = 0; round < 5; round++) {
    await assigned('eric', 'quote_accepted');
    await assigned('eric', 'in_progress');
    const jobs = [await openJob(`Round ${round}: tap`, 'client'), await openJob(`Round ${round}: sink`, 'grace')];
    for (const job of jobs) assert.equal((await respond(job, 'eric')).status, 201);
    const quotes = await Promise.all(jobs.map(job => Quote.findOne({ job: job._id, worker: users.eric._id }).lean()));

    const results = await Promise.all([
      post(`/api/jobs/${jobs[0]._id}/select`, 'client', { quoteId: quotes[0]._id }),
      post(`/api/jobs/${jobs[1]._id}/select`, 'grace', { quoteId: quotes[1]._id })
    ]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409], `round ${round}`);
    assert.equal(results.find(r => r.status === 409).data.error, WORKER_BUSY_MESSAGE);
    assert.equal(await active(), 3, `round ${round}`);
    // The refused job is untouched: still open, its offer still pending.
    const refusedJob = jobs[results.findIndex(r => r.status === 409)];
    assert.equal((await Job.findById(refusedJob._id).lean()).status, 'open');
    assert.equal((await Quote.findOne({ job: refusedJob._id }).lean()).status, 'pending');

    await Job.deleteMany({ $or: [{ worker: users.eric._id }, { _id: { $in: jobs.map(j => j._id) } }] });
    await Quote.deleteMany({ worker: users.eric._id });
  }
});
