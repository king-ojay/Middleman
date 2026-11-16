// The call button: a job's client and worker get each other's phone number on
// the job page (GET /api/jobs/:id, otherPartyPhone) while the job is active,
// from the choice of worker until it is confirmed, settled after a dispute or
// reopened. Never before, never after, never to anyone else, and never on any
// other route. Needs TEST_MONGO_URI.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const MONGO = process.env.TEST_MONGO_URI && (() => {
  const url = new URL(process.env.TEST_MONGO_URI);
  url.pathname += '_callphone';
  return url.toString();
})();
const skip = !MONGO && 'set TEST_MONGO_URI to run API tests';
const ADMIN_SECRET = 'callphone-test-admin-secret';
const DETAILS = 'The tap still leaks after the repair was finished.';

let server, base, mongoose, Job, users, tokens;

before(async () => {
  if (skip) return;
  if (!/test/i.test(MONGO)) throw new Error('TEST_MONGO_URI must point at a database with "test" in its name');
  process.env.SESSION_SECRET = 'api-test-secret';
  process.env.ADMIN_SECRET = ADMIN_SECRET;

  mongoose = (await import('mongoose')).default;
  const { default: User } = await import('../modules/users/user.model.js');
  ({ default: Job } = await import('../modules/jobs/job.model.js'));
  const { default: Quote } = await import('../modules/jobs/quote.model.js');
  const { default: Transaction } = await import('../modules/payments/transaction.model.js');
  const { createFakeProvider } = await import('../modules/payments/providers/fake.js');
  const { setPaymentProvider } = await import('../modules/payments/providers/index.js');
  const { createSessionToken } = await import('../modules/auth/session.js');
  const { default: app } = await import('../app.js');

  await mongoose.connect(MONGO);
  await mongoose.connection.dropDatabase();
  await Promise.all([User, Job, Quote, Transaction].map(M => M.createIndexes()));
  const created = await User.create([
    { name: 'Clara Mukamana', phone: '0788650001', role: 'client', area: 'remera' },
    { name: 'Walter Niyonzima', phone: '0788650002', role: 'worker', area: 'remera', skills: ['plumber'] },
    { name: 'Olga Uwase', phone: '0788650003', role: 'worker', area: 'remera', skills: ['plumber'] },
    { name: 'Sam Stranger', phone: '0788650004', role: 'client', area: 'remera' },
    { name: 'Gaston Leaving', phone: '0788650005', role: 'worker', area: 'remera', skills: ['plumber'] },
    { name: 'Gloria Leaving', phone: '0788650006', role: 'client', area: 'remera' }
  ]);
  users = Object.fromEntries(['client', 'worker', 'bidder', 'stranger', 'leavingWorker', 'leavingClient'].map((k, i) => [k, created[i]]));
  tokens = {};
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
const page = async (job, as) => {
  const res = await call('GET', `/api/jobs/${job._id}`, { as });
  assert.equal(res.status, 200, `${as}: ${JSON.stringify(res.data)}`);
  return res.data;
};

const ALL_PHONES = () => Object.values(users).map(u => u.phone.slice(1)); // without the leading 0
const noPhones = (data, where) => {
  const text = JSON.stringify(data);
  for (const phone of ALL_PHONES()) assert.equal(text.includes(phone), false, `${phone} in ${where}: ${text}`);
};

// Client and worker see each other's number on the page, and nothing else
// carries a phone; the other bidder and a stranger see none.
async function assertActive(job, client = 'client', worker = 'worker') {
  for (const [as, other] of [[client, worker], [worker, client]]) {
    const { otherPartyPhone, ...rest } = await page(job, as);
    assert.equal(otherPartyPhone, users[other].phone, `${as} on a ${rest.status} job`);
    noPhones(rest, `the rest of the ${rest.status} job seen by ${as}`);
  }
  for (const as of ['bidder', 'stranger']) noPhones(await page(job, as), `the job seen by ${as}`);
}
async function assertNoPhone(job, who = ['client', 'worker', 'bidder', 'stranger']) {
  for (const as of who) {
    const data = await page(job, as);
    assert.equal('otherPartyPhone' in data, false, `${as} on a ${data.status} job`);
    noPhones(data, `the ${data.status} job seen by ${as}`);
  }
}

// An open job with offers from the worker and the bidder; the client chooses
// the worker (through the API).
async function chosenJob({ client = 'client', worker = 'worker', bidder = 'bidder', checkBefore = false } = {}) {
  const job = await Job.create({ client: users[client]._id, category: 'plumber', area: 'remera', description: 'Fix the kitchen tap', proposedPrice: 15000 });
  for (const as of [worker, bidder]) assert.equal((await post(`/api/jobs/${job._id}/responses`, as, {})).status, 201);
  if (checkBefore) await assertNoPhone(job, [client, worker, bidder, 'stranger']);
  const quote = (await page(job, client)).responses.find(r => String(r.worker._id) === String(users[worker]._id));
  assert.equal((await post(`/api/jobs/${job._id}/select`, client, { quoteId: quote._id })).status, 200);
  return job;
}
const fund = async (job, as = 'client') => assert.equal((await post(`/api/jobs/${job._id}/fund`, as)).status, 200);
const dispute = async job => assert.equal((await post(`/api/jobs/${job._id}/dispute`, 'client', { reason: 'not_done', details: DETAILS })).status, 200);

test('nobody has it before the choice; both parties have it from the choice through every active step; nobody after confirmation', { skip }, async () => {
  const job = await chosenJob({ checkBefore: true });
  await assertActive(job); // quote_accepted
  await fund(job);
  await assertActive(job); // escrow_held
  assert.equal((await post(`/api/jobs/${job._id}/start`, 'worker')).status, 200);
  await assertActive(job); // in_progress
  assert.equal((await post(`/api/jobs/${job._id}/complete`, 'worker')).status, 200);
  await assertActive(job); // awaiting_confirmation
  assert.equal((await post(`/api/jobs/${job._id}/confirm`, 'client', { score: 5 })).status, 200);
  assert.equal((await page(job, 'client')).status, 'completed');
  await assertNoPhone(job);
});

test('a disputed job keeps it; settling the dispute either way removes it', { skip }, async () => {
  for (const outcome of ['release', 'refund']) {
    const job = await chosenJob();
    await fund(job);
    await dispute(job);
    await assertActive(job); // disputed
    const settled = await call('POST', `/api/admin/jobs/${job._id}/${outcome}`, { admin: true });
    assert.equal(settled.status, 200);
    assert.equal(settled.data.status, 'resolved');
    noPhones(settled.data, `the admin's ${outcome} answer`);
    await assertNoPhone(job);
  }
});

test('while a job is active, Discover, offers, profiles, job lists, the feed and transactions still carry no phone number', { skip }, async () => {
  const job = await chosenJob();
  await fund(job);
  const offersJob = await Job.create({ client: users.client._id, category: 'plumber', area: 'remera', description: 'Fix the shower', proposedPrice: 9000 });
  for (const as of ['worker', 'bidder']) assert.equal((await post(`/api/jobs/${offersJob._id}/responses`, as, {})).status, 201);

  const routes = {
    'discover': ['GET', '/api/discover?category=plumber', 'client'],
    'discover by area': ['GET', '/api/discover?category=plumber&area=remera', 'client'],
    'offers on another job': ['GET', `/api/jobs/${offersJob._id}`, 'client'],
    'the worker\'s profile': ['GET', `/api/users/${users.worker._id}/profile`, 'client'],
    'the client\'s profile': ['GET', `/api/users/${users.client._id}/profile`, 'worker'],
    'the client\'s jobs': ['GET', '/api/jobs/mine', 'client'],
    'the worker\'s jobs': ['GET', '/api/jobs/mine', 'worker'],
    'the feed': ['GET', '/api/jobs/feed?area=all&trade=any', 'bidder'],
    'the client\'s transactions': ['GET', '/api/transactions', 'client'],
    'the worker\'s transactions': ['GET', '/api/transactions', 'worker']
  };
  for (const [where, [method, path, as]] of Object.entries(routes)) {
    const res = await call(method, path, { as });
    assert.equal(res.status, 200, where);
    noPhones(res.data, where);
  }
  // the routes really answered about these people and jobs
  const offers = await call('GET', `/api/jobs/${offersJob._id}`, { as: 'client' });
  assert.equal(offers.data.responses.length, 2);
  assert.equal('otherPartyPhone' in offers.data, false);
  assert.ok((await call('GET', '/api/transactions', { as: 'client' })).data.transactions.length > 0);
});

test('deleting an account removes it: a deleted worker\'s job reopens without it, a deleted client\'s job is gone', { skip }, async () => {
  const fromWorker = await chosenJob({ worker: 'leavingWorker' });
  await assertActive(fromWorker, 'client', 'leavingWorker');
  const del = id => call('POST', '/api/admin/users/deletion/delete', { admin: true, body: { userId: String(id) } });
  assert.equal((await del(users.leavingWorker._id)).status, 200);
  const reopened = await page(fromWorker, 'client');
  assert.equal(reopened.status, 'open');
  assert.equal('otherPartyPhone' in reopened, false);
  noPhones(reopened, 'the reopened job');

  const fromClient = await chosenJob({ client: 'leavingClient' });
  await assertActive(fromClient, 'leavingClient', 'worker');
  assert.equal((await del(users.leavingClient._id)).status, 200);
  assert.equal((await call('GET', `/api/jobs/${fromClient._id}`, { as: 'worker' })).status, 404);
});
