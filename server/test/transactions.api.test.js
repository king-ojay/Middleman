// GET /api/transactions: your own money movements from the escrow ledger.
// The jobs go through the real API with the fake payment provider, so the
// ledger is what production writes. Needs TEST_MONGO_URI.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const MONGO = process.env.TEST_MONGO_URI && (() => {
  const url = new URL(process.env.TEST_MONGO_URI);
  url.pathname += '_transactions';
  return url.toString();
})();
const skip = !MONGO && 'set TEST_MONGO_URI to run API tests';
// A valid problem report (POST /api/jobs/:id/dispute needs a reason and a description).
const REPORT = {
  client: { reason: 'not_done', details: 'The worker left before finishing the job.' },
  worker: { reason: 'not_confirming', details: 'The work is finished but the client will not confirm it.' }
};
const ADMIN_SECRET = 'transactions-test-admin-secret';

let server, base, mongoose, Job, users, tokens, fake, jobs;

before(async () => {
  if (skip) return;
  if (!/test/i.test(MONGO)) throw new Error('TEST_MONGO_URI must point at a database with "test" in its name');
  process.env.SESSION_SECRET = 'api-test-secret';
  process.env.ADMIN_SECRET = ADMIN_SECRET;

  mongoose = (await import('mongoose')).default;
  const { default: User } = await import('../modules/users/user.model.js');
  ({ default: Job } = await import('../modules/jobs/job.model.js'));
  const { default: Transaction } = await import('../modules/payments/transaction.model.js');
  const { createFakeProvider } = await import('../modules/payments/providers/fake.js');
  const { setPaymentProvider } = await import('../modules/payments/providers/index.js');
  const { createSessionToken } = await import('../modules/auth/session.js');
  const { default: app } = await import('../app.js');

  await mongoose.connect(MONGO);
  await mongoose.connection.dropDatabase();
  await Promise.all([User, Job, Transaction].map(M => M.createIndexes()));
  const [client, worker, other, stranger, busy] = await User.create([
    { name: 'Clara Mukamana', phone: '0788620001', role: 'client', area: 'remera' },
    { name: 'Walter Niyonzima', phone: '0788620002', role: 'worker', area: 'remera', skills: ['plumber'] },
    { name: 'Olga Uwase', phone: '0788620003', role: 'worker', area: 'remera', skills: ['plumber'] },
    { name: 'Sam Stranger', phone: '0788620004', role: 'client', area: 'remera' },
    { name: 'Bea Busy', phone: '0788620005', role: 'client', area: 'remera' }
  ]);
  users = { client, worker, other, stranger, busy };
  tokens = {};
  for (const [key, u] of Object.entries(users)) tokens[key] = createSessionToken(await User.findById(u._id).select('+sessionVersion'));
  fake = createFakeProvider();
  setPaymentProvider(fake);
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;

  const accepted = (description, price, extra = {}) => Job.create({
    client: client._id, worker: worker._id, category: 'plumber', area: 'remera', description,
    proposedPrice: price, agreedPrice: price, status: 'quote_accepted', acceptedAt: new Date(), ...extra
  });
  const ok = async (method, path, as, body) => assert.equal((await call(method, path, as, body)).status, 200, `${method} ${path}`);
  const funded = async job => { await ok('POST', `/api/jobs/${job._id}/fund`, 'client'); return job; };
  const done = async job => {
    await ok('POST', `/api/jobs/${job._id}/start`, 'worker');
    await ok('POST', `/api/jobs/${job._id}/complete`, 'worker');
  };
  const admin = path => fetch(base + path, { method: 'POST', headers: { 'x-admin-secret': ADMIN_SECRET } });
  jobs = {};

  // Confirmed and released.
  jobs.released = await funded(await accepted('Fix the kitchen tap', 15000));
  await done(jobs.released);
  await ok('POST', `/api/jobs/${jobs.released._id}/confirm`, 'client', { score: 5 });

  // A refused payment, then a payment, a dispute and a refund.
  jobs.refunded = await accepted('Paint the gate', 9000);
  fake.failNext('requestToPay', 'refuse');
  assert.equal((await call('POST', `/api/jobs/${jobs.refunded._id}/fund`, 'client')).status, 502);
  await funded(jobs.refunded);
  await ok('POST', `/api/jobs/${jobs.refunded._id}/dispute`, 'worker', REPORT.worker);
  assert.equal((await admin(`/api/admin/jobs/${jobs.refunded._id}/refund`)).status, 200);

  // Done, disputed, and released by an admin.
  jobs.disputeReleased = await funded(await accepted('Unblock the drain', 13000));
  await done(jobs.disputeReleased);
  await ok('POST', `/api/jobs/${jobs.disputeReleased._id}/dispute`, 'client', REPORT.client);
  assert.equal((await admin(`/api/admin/jobs/${jobs.disputeReleased._id}/release`)).status, 200);

  // A payment still waiting for the payer.
  jobs.pending = await accepted('Replace the shower head', 5000);
  fake.failNext('requestToPay', 'pending');
  assert.equal((await call('POST', `/api/jobs/${jobs.pending._id}/fund`, 'client')).status, 202);

  // The same client with another worker: Walter must not see it.
  jobs.otherWorker = await funded(await accepted('Fix the toilet', 4000, { worker: other._id }));
  await call('POST', `/api/jobs/${jobs.otherWorker._id}/start`, 'other');
  await call('POST', `/api/jobs/${jobs.otherWorker._id}/complete`, 'other');
  await ok('POST', `/api/jobs/${jobs.otherWorker._id}/confirm`, 'client', { score: 4 });

  // 21 payments into escrow for paging.
  for (let i = 0; i < 21; i++) {
    const job = await Job.create({
      client: busy._id, worker: worker._id, category: 'plumber', area: 'remera', description: `Busy job ${i}`,
      proposedPrice: 1000, agreedPrice: 1000, status: 'quote_accepted', acceptedAt: new Date()
    });
    await ok('POST', `/api/jobs/${job._id}/fund`, 'busy');
  }
});

after(async () => {
  if (skip) return;
  server.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function call(method, path, as, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(as ? { authorization: `Bearer ${tokens[as]}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const list = async (as, offset) => {
  const res = await call('GET', `/api/transactions${offset ? `?offset=${offset}` : ''}`, as);
  assert.equal(res.status, 200);
  return res.data;
};
// "<description>: <type> <status> <amount> <other>" for each row, newest first.
const summary = data => data.transactions.map(r => `${r.job.description}: ${r.type} ${r.status} ${r.amount} ${r.other}`);

test('the client sees their own payments in, releases and refunds, failed and pending ones included, newest first', { skip }, async () => {
  const data = await list('client');
  assert.equal(data.role, 'client');
  assert.deepEqual(summary(data), [
    'Fix the toilet: released completed 4000 Olga U.',
    'Fix the toilet: paid_in completed 4000 Olga U.',
    'Replace the shower head: paid_in pending 5000 Walter N.',
    'Unblock the drain: released completed 13000 Walter N.',
    'Unblock the drain: paid_in completed 13000 Walter N.',
    'Paint the gate: refunded refunded 9000 Walter N.',
    'Paint the gate: paid_in refunded 9000 Walter N.',
    'Paint the gate: paid_in failed 9000 Walter N.',
    'Fix the kitchen tap: released completed 15000 Walter N.',
    'Fix the kitchen tap: paid_in completed 15000 Walter N.'
  ]);
  const times = data.transactions.map(r => new Date(r.at).getTime());
  assert.deepEqual(times, [...times].sort((a, b) => b - a));
  assert.deepEqual(data.transactions.map(r => r.direction), ['moved', 'out', 'out', 'moved', 'out', 'in', 'out', 'out', 'moved', 'out']);
});

test('the worker sees only what was released to them, from both of their jobs\' clients, not the other worker\'s job', { skip }, async () => {
  const data = await list('worker');
  assert.equal(data.role, 'worker');
  assert.deepEqual(summary(data).filter(s => !s.startsWith('Busy')), [
    'Unblock the drain: received completed 13000 Clara M.',
    'Fix the kitchen tap: received completed 15000 Clara M.'
  ]);
  assert.equal(data.transactions.every(r => r.direction === 'in'), true);
});

test('totals match the completed rows; failed, pending, held and refunded money is not counted', { skip }, async () => {
  const client = await list('client');
  const released = client.transactions.filter(r => r.type === 'released' && r.status === 'completed');
  assert.deepEqual(client.totals, { total: released.reduce((s, r) => s + r.amount, 0), jobs: released.length });
  assert.deepEqual(client.totals, { total: 32000, jobs: 3 });
  assert.deepEqual((await list('worker')).totals, { total: 28000, jobs: 2 });
  // The same figures as the private earnings on the profile.
  const profile = (await call('GET', `/api/users/${users.worker._id}/profile`, 'worker')).data;
  assert.equal(profile.earnings.total, 28000);
  assert.equal(profile.earnings.jobs, 2);
});

test('someone with no jobs gets an empty list and zero totals, never anyone else\'s rows', { skip }, async () => {
  assert.deepEqual(await list('stranger'), { role: 'client', totals: { total: 0, jobs: 0 }, transactions: [], nextOffset: null });
  assert.equal((await call('GET', '/api/transactions')).status, 401);
});

test('no phone numbers, provider references or other people\'s ids in the response', { skip }, async () => {
  const ledgerRefs = (await Job.find({ client: users.client._id }).lean()).flatMap(j => [j.escrow?.fundRef, j.escrow?.releaseRef, j.escrow?.refundRef]).filter(Boolean);
  assert.ok(ledgerRefs.length >= 5);
  for (const as of ['client', 'worker']) {
    const text = JSON.stringify(await list(as));
    for (const u of Object.values(users)) {
      assert.equal(text.includes(u.phone.slice(1)), false, `${as}: phone of ${u.name}`);
      assert.equal(text.includes(u.name.split(' ')[1]), false, `${as}: full surname of ${u.name}`);
      if (as !== 'client' || u !== users.client) assert.equal(text.includes(String(u._id)), false, `${as}: id of ${u.name}`);
    }
    for (const ref of ledgerRefs) assert.equal(text.includes(ref), false, `${as}: provider reference`);
    assert.equal(/phone|providerRef|provider"|fundRef|releaseRef|refundRef/.test(text), false, as);
  }
});

test('20 rows a page; the totals cover every row', { skip }, async () => {
  const first = await list('busy');
  assert.equal(first.transactions.length, 20);
  assert.equal(first.nextOffset, 20);
  const second = await list('busy', first.nextOffset);
  assert.equal(second.transactions.length, 1);
  assert.equal(second.nextOffset, null);
  assert.equal(new Set([...first.transactions, ...second.transactions].map(r => r.id)).size, 21);
  assert.equal(second.transactions[0].job.description, 'Busy job 0');
  assert.deepEqual(second.totals, first.totals);
});
