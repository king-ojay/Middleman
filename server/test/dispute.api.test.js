// Reporting a problem on a job (POST /api/jobs/:id/dispute) needs a reason
// from the reporter's own list and a 20-500 character description. The two
// parties and the admin can read it; nobody else can, and it never reaches
// the payment provider. Needs TEST_MONGO_URI.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SHARED, generated } from '../../scripts/syncShared.mjs';

const MONGO = process.env.TEST_MONGO_URI && (() => {
  const url = new URL(process.env.TEST_MONGO_URI);
  url.pathname += '_dispute';
  return url.toString();
})();
const skip = !MONGO && 'set TEST_MONGO_URI to run API tests';
const ADMIN_SECRET = 'dispute-test-admin-secret';

const DETAILS = 'Le robinet fuit encore après la réparation, and the worker left early.';

let server, base, mongoose, Job, Transaction, users, tokens, setPaymentProvider, createFakeProvider;

before(async () => {
  if (skip) return;
  if (!/test/i.test(MONGO)) throw new Error('TEST_MONGO_URI must point at a database with "test" in its name');
  process.env.SESSION_SECRET = 'api-test-secret';
  process.env.ADMIN_SECRET = ADMIN_SECRET;

  mongoose = (await import('mongoose')).default;
  const { default: User } = await import('../modules/users/user.model.js');
  ({ default: Job } = await import('../modules/jobs/job.model.js'));
  ({ default: Transaction } = await import('../modules/payments/transaction.model.js'));
  ({ createFakeProvider } = await import('../modules/payments/providers/fake.js'));
  ({ setPaymentProvider } = await import('../modules/payments/providers/index.js'));
  const { createSessionToken } = await import('../modules/auth/session.js');
  const { default: app } = await import('../app.js');

  await mongoose.connect(MONGO);
  await mongoose.connection.dropDatabase();
  await Promise.all([User, Job, Transaction].map(M => M.createIndexes()));
  const [client, worker, otherWorker, otherClient] = await User.create([
    { name: 'Clara Mukamana', phone: '0788630001', role: 'client', area: 'remera' },
    { name: 'Walter Niyonzima', phone: '0788630002', role: 'worker', area: 'remera', skills: ['plumber'] },
    { name: 'Olga Uwase', phone: '0788630003', role: 'worker', area: 'remera', skills: ['plumber'] },
    { name: 'Sam Stranger', phone: '0788630004', role: 'client', area: 'remera' }
  ]);
  users = { client, worker, otherWorker, otherClient };
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
const report = (job, as, body) => call('POST', `/api/jobs/${job._id}/dispute`, { as, body });

// A job the client has paid into escrow, through the API.
async function heldJob() {
  const job = await Job.create({
    client: users.client._id, worker: users.worker._id, category: 'plumber', area: 'remera', description: 'Fix the kitchen tap',
    proposedPrice: 15000, agreedPrice: 15000, status: 'quote_accepted', acceptedAt: new Date()
  });
  assert.equal((await call('POST', `/api/jobs/${job._id}/fund`, { as: 'client' })).status, 200);
  return job;
}

test('a report without a reason, with another role\'s reason, or with a missing, short or long description is refused; nothing is locked', { skip }, async () => {
  const job = await heldJob();
  const refused = [
    [undefined, 'Choose what the problem is'],
    [{ details: DETAILS }, 'Choose what the problem is'],
    [{ reason: 'not_confirming', details: DETAILS }, 'Choose what the problem is'], // a worker's reason
    [{ reason: 'made_up', details: DETAILS }, 'Choose what the problem is'],
    [{ reason: 'not_done' }, 'Describe what is wrong in at least 20 characters'],
    [{ reason: 'not_done', details: 'Too short.' }, 'Describe what is wrong in at least 20 characters'],
    // 19 characters once the markup and spaces are gone
    [{ reason: 'not_done', details: '<b>   abcdefghij  </b>   <i>abcdefgh</i>   ' }, 'Describe what is wrong in at least 20 characters'],
    [{ reason: 'not_done', details: 'x'.repeat(501) }, 'Keep the description to 500 characters or fewer']
  ];
  for (const [body, error] of refused) {
    const res = await report(job, 'client', body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.data.error, error);
  }
  const after = await Job.findById(job._id).lean();
  assert.equal(after.status, 'escrow_held');
  assert.equal(after.disputeReason, null);
  assert.equal(await Transaction.countDocuments({ job: job._id, event: 'dispute_opened' }), 0);
});

test('a valid report locks escrow as before and stores the reason, the cleaned description, who and when', { skip }, async () => {
  const job = await heldJob();
  const res = await report(job, 'client', { reason: 'poor_quality', details: `  <script>alert(1)</script>${DETAILS}‮\r\n\r\n\r\n  Please check.  ` });
  assert.equal(res.status, 200);
  assert.equal(res.data.status, 'disputed');
  assert.equal(res.data.escrow.status, 'held');

  const stored = await Job.findById(job._id).lean();
  assert.equal(stored.disputeReason, 'poor_quality');
  assert.equal(stored.disputeDetails, `alert(1) ${DETAILS}\n\nPlease check.`);
  assert.equal(String(stored.disputedBy), String(users.client._id));
  assert.ok(Date.now() - stored.disputedAt.getTime() < 60000);
  assert.equal(await Transaction.countDocuments({ job: job._id, event: 'dispute_opened' }), 1);
  // Locked: no start, no confirm, no second report.
  assert.equal((await call('POST', `/api/jobs/${job._id}/start`, { as: 'worker' })).status, 409);
  assert.equal((await report(job, 'worker', { reason: 'other', details: DETAILS })).status, 409);
});

test('both parties and the admin can read the report; the admin sees who reported it, without names or phone numbers', { skip }, async () => {
  const job = await heldJob();
  assert.equal((await report(job, 'worker', { reason: 'unreachable', details: DETAILS })).status, 200);

  for (const as of ['client', 'worker']) {
    const { status, data } = await call('GET', `/api/jobs/${job._id}`, { as });
    assert.equal(status, 200);
    assert.equal(data.disputeReason, 'unreachable', as);
    assert.equal(data.disputeDetails, DETAILS, as);
    assert.equal(String(data.disputedBy), String(users.worker._id), as);
  }

  const { status, data } = await call('GET', '/api/admin/disputes', { admin: true });
  assert.equal(status, 200);
  const listed = data.find(j => String(j._id) === String(job._id));
  assert.equal(listed.reportedBy, 'worker');
  assert.equal(listed.disputeReason, 'unreachable');
  assert.equal(listed.disputeDetails, DETAILS);
  const text = JSON.stringify(data);
  for (const u of Object.values(users)) {
    assert.equal(text.includes(u.phone.slice(1)), false, `phone of ${u.name}`);
    assert.equal(text.includes(u.name), false, `name of ${u.name}`);
  }
});

test('nobody else can read it or report on the job', { skip }, async () => {
  const job = await heldJob();
  await report(job, 'client', { reason: 'no_show', details: DETAILS });
  for (const as of ['otherWorker', 'otherClient']) {
    const { status, data } = await call('GET', `/api/jobs/${job._id}`, { as });
    assert.equal(status, 200);
    for (const field of ['disputeReason', 'disputeDetails', 'disputedBy']) assert.equal(field in data, false, `${as}: ${field}`);
    assert.equal(JSON.stringify(data).includes('robinet'), false, as);
  }
  const fresh = await heldJob();
  assert.equal((await report(fresh, 'otherClient', { reason: 'no_show', details: DETAILS })).status, 403);
  assert.equal((await report(fresh, 'otherWorker', { reason: 'other', details: DETAILS })).status, 403);
});

test('the report never reaches the payment provider: refund and release through the MoMo sandbox stub', { skip }, async () => {
  const { createMomoSandboxProvider } = await import('../modules/payments/providers/momoSandbox.js');
  const { sandboxFetch, SANDBOX_ENV } = await import('./momoSandboxStub.js');
  const { fetchImpl, requests } = sandboxFetch();
  const seen = [];
  const recording = async (url, init = {}) => { seen.push(JSON.stringify({ url: String(url), headers: init.headers, body: init.body })); return fetchImpl(url, init); };
  setPaymentProvider(createMomoSandboxProvider(SANDBOX_ENV, recording));
  try {
    const refunded = await heldJob();
    await report(refunded, 'client', { reason: 'not_done', details: DETAILS });
    assert.equal((await call('POST', `/api/admin/jobs/${refunded._id}/refund`, { admin: true })).status, 200);
    const released = await heldJob();
    await report(released, 'worker', { reason: 'not_confirming', details: DETAILS });
    assert.equal((await call('POST', `/api/admin/jobs/${released._id}/release`, { admin: true })).status, 200);

    assert.ok(requests.filter(r => r.method === 'POST' && !r.url.endsWith('/token/')).length >= 4);
    for (const sent of seen) for (const word of ['robinet', 'worker left', 'not_done', 'not_confirming']) assert.equal(sent.includes(word), false, word);
  } finally {
    setPaymentProvider(createFakeProvider());
  }
});

test('a dispute from before reasons were asked for still loads, with no reason', { skip }, async () => {
  const old = await Job.create({
    client: users.client._id, worker: users.worker._id, category: 'plumber', area: 'remera', description: 'Old dispute',
    proposedPrice: 5000, agreedPrice: 5000, status: 'disputed', disputedAt: new Date(), disputedBy: users.client._id,
    escrow: { status: 'held', amount: 5000, currency: 'RWF', provider: 'fake' }
  });
  await Job.collection.updateOne({ _id: old._id }, { $unset: { disputeReason: '', disputeDetails: '' } });
  const { status, data } = await call('GET', `/api/jobs/${old._id}`, { as: 'worker' });
  assert.equal(status, 200);
  assert.equal(data.disputeReason ?? null, null);
  const listed = (await call('GET', '/api/admin/disputes', { admin: true })).data.find(j => String(j._id) === String(old._id));
  assert.equal(listed.disputeReason ?? null, null);
  assert.equal(listed.reportedBy, 'client');
});

test('the reason lists are the generated copies of shared/disputeReasons.js', () => {
  const root = new URL('../../', import.meta.url);
  const { source, copies } = SHARED.find(s => s.source === 'shared/disputeReasons.js');
  const expected = generated(readFileSync(new URL(source, root), 'utf8'), source);
  for (const copy of copies) assert.equal(readFileSync(new URL(copy, root), 'utf8'), expected, `${copy} is out of date`);
});
