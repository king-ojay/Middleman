// Verification: only the researcher (ADMIN_SECRET) sets or revokes it, it
// records who, when and how (no documents or photos), it feeds the trust
// floor exactly as before (0.3 verified, 0.1 unverified), and other users see
// only a "Verified" badge. Needs TEST_MONGO_URI.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const MONGO = process.env.TEST_MONGO_URI && (() => {
  const url = new URL(process.env.TEST_MONGO_URI);
  url.pathname += '_verify';
  return url.toString();
})();
const skip = !MONGO && 'set TEST_MONGO_URI to run API tests';
const ADMIN_SECRET = 'verify-test-admin-secret';

let server, base, mongoose, User, Job, rankByTrust, users, tokens;

before(async () => {
  if (skip) return;
  if (!/test/i.test(MONGO)) throw new Error('TEST_MONGO_URI must point at a database with "test" in its name');
  process.env.SESSION_SECRET = 'api-test-secret';
  process.env.ADMIN_SECRET = ADMIN_SECRET;
  process.env.PAYMENT_PROVIDER = 'fake';

  mongoose = (await import('mongoose')).default;
  ({ default: User } = await import('../modules/users/user.model.js'));
  ({ default: Job } = await import('../modules/jobs/job.model.js'));
  ({ rankByTrust } = await import('../modules/trust/trustPropagation.js'));
  const { createSessionToken } = await import('../modules/auth/session.js');
  const { default: app } = await import('../app.js');

  await mongoose.connect(MONGO);
  await mongoose.connection.dropDatabase();
  await User.createIndexes();
  const [viewer, worker, other] = await User.create([
    { name: 'Viewer Ver', phone: '0788700001', role: 'client', area: 'gikondo' },
    { name: 'Worker Ver', phone: '0788700002', role: 'worker', area: 'remera', skills: ['tiler'] },
    { name: 'Other Ver', phone: '0788700003', role: 'worker', area: 'remera', skills: ['tiler'] }
  ]);
  users = { viewer, worker, other };
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

const call = async (method, path, { as, body, secret } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(as ? { authorization: `Bearer ${tokens[as]}` } : {}),
      ...(secret !== undefined ? { 'x-admin-secret': secret } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};
const admin = (action, body) => call('POST', `/api/admin/verification/${action}`, { body, secret: ADMIN_SECRET });
const floorOf = async id => {
  const [ranked] = await rankByTrust(users.viewer._id, [await User.findById(id).lean()]);
  return { score: ranked.trustScore, tier: ranked.trustSource };
};

test('only the researcher can verify: no secret or a wrong one is refused; unset ADMIN_SECRET turns it off', { skip }, async () => {
  assert.equal((await call('POST', '/api/admin/verification/verify', { body: { phone: '0788700002' } })).status, 401);
  assert.equal((await call('POST', '/api/admin/verification/verify', { body: { phone: '0788700002' }, secret: 'nope' })).status, 401);
  // a logged-in user is not an admin
  assert.equal((await call('POST', '/api/admin/verification/verify', { as: 'worker', body: { phone: '0788700002' } })).status, 401);
  delete process.env.ADMIN_SECRET;
  try {
    assert.equal((await admin('verify', { phone: '0788700002' })).status, 503);
  } finally {
    process.env.ADMIN_SECRET = ADMIN_SECRET;
  }
  assert.equal((await User.findById(users.worker._id).lean()).verifiedStatus, 'unverified');
});

test('verify records who, when and how; the answer has no name or phone; revoke clears it', { skip }, async () => {
  const before = Date.now();
  const res = await admin('verify', { phone: '0788 700 002' });
  assert.equal(res.status, 200);
  assert.equal(res.data.verifiedStatus, 'verified');
  assert.equal(res.data.verifiedBy, 'researcher');
  assert.equal(res.data.verificationMethod, 'in-person');
  assert.ok(new Date(res.data.verifiedAt).getTime() >= before);
  assert.deepEqual(Object.keys(res.data).sort(), ['_id', 'role', 'verificationMethod', 'verifiedAt', 'verifiedBy', 'verifiedStatus']);

  const revoked = await admin('revoke', { userId: String(users.worker._id) });
  assert.equal(revoked.status, 200);
  assert.deepEqual(
    [revoked.data.verifiedStatus, revoked.data.verifiedBy, revoked.data.verifiedAt, revoked.data.verificationMethod],
    ['unverified', null, null, null]
  );
});

test('bad requests: neither id nor phone, a malformed phone or id, an unknown person', { skip }, async () => {
  assert.equal((await admin('verify', {})).status, 400);
  assert.equal((await admin('verify', { phone: '12345' })).status, 400);
  assert.equal((await admin('verify', { phone: { $ne: '' } })).status, 400);
  assert.equal((await admin('verify', { userId: 'not-an-id' })).status, 404);
  assert.equal((await admin('verify', { phone: '0788799999' })).status, 404);
  assert.equal((await admin('revoke', { userId: String(new mongoose.Types.ObjectId()) })).status, 404);
});

test('the trust floor is exactly as before: 0.1 unverified, 0.3 verified, back to 0.1 when revoked', { skip }, async () => {
  assert.deepEqual(await floorOf(users.worker._id), { score: 0.1, tier: 'fallback' });
  await admin('verify', { userId: String(users.worker._id) });
  assert.deepEqual(await floorOf(users.worker._id), { score: 0.3, tier: 'fallback' });
  await admin('revoke', { userId: String(users.worker._id) });
  assert.deepEqual(await floorOf(users.worker._id), { score: 0.1, tier: 'fallback' });
});

test('other users see only the badge: Discover sends verified true/false and ranks the verified worker first; no who/when/how anywhere', { skip }, async () => {
  await admin('verify', { userId: String(users.other._id) });
  const discover = (await call('GET', '/api/discover?category=tiler', { as: 'viewer' })).data;
  assert.deepEqual(discover.map(w => [w.name, w.verified]), [['Other Ver', true], ['Worker Ver', false]]);
  const profile = (await call('GET', `/api/users/${users.other._id}/profile`, { as: 'viewer' })).data;
  assert.equal(profile.user?.verifiedStatus ?? profile.verifiedStatus, 'verified');
  for (const text of [JSON.stringify(discover), JSON.stringify(profile)]) {
    for (const field of ['verifiedBy', 'verifiedAt', 'verificationMethod', 'researcher', 'in-person']) assert.equal(text.includes(field), false, field);
  }
  await admin('revoke', { userId: String(users.other._id) });
});

test('nobody can verify themselves through their own profile', { skip }, async () => {
  const res = await call('PATCH', '/api/users/me', {
    as: 'worker', body: { area: 'kimironko', verifiedStatus: 'verified', verifiedBy: 'researcher', verifiedAt: new Date(), verificationMethod: 'in-person' }
  });
  assert.equal(res.status, 200);
  const stored = await User.findById(users.worker._id).lean();
  assert.deepEqual([stored.verifiedStatus, stored.verifiedBy, stored.verifiedAt, stored.verificationMethod], ['unverified', null, null, null]);
  await call('PATCH', '/api/users/me', { as: 'worker', body: { area: 'remera' } });
});

test('the unverified list (admin page): secret only, unverified workers only, name, area, trades and full phone; read-only', { skip }, async () => {
  const list = () => call('GET', '/api/admin/verification/unverified', { secret: ADMIN_SECRET });
  assert.equal((await call('GET', '/api/admin/verification/unverified')).status, 401);
  assert.equal((await call('GET', '/api/admin/verification/unverified', { secret: 'nope' })).status, 401);
  assert.equal((await call('GET', '/api/admin/verification/unverified', { as: 'worker' })).status, 401);

  const usersBefore = await User.find().lean();
  const res = await list();
  assert.equal(res.status, 200);
  // the client (viewer) is never listed; both workers start unverified
  assert.deepEqual(res.data.map(w => w.name), ['Worker Ver', 'Other Ver']);
  assert.deepEqual(Object.keys(res.data[0]).sort(), ['_id', 'area', 'name', 'phone', 'skills']);
  assert.deepEqual([res.data[0].area, res.data[0].skills, res.data[0].phone], ['remera', ['tiler'], '0788700002']);
  assert.deepEqual(await User.find().lean(), usersBefore);

  // verified workers drop off the list, and come back when revoked
  await admin('verify', { userId: String(users.other._id) });
  assert.deepEqual((await list()).data.map(w => w.name), ['Worker Ver']);
  await admin('revoke', { userId: String(users.other._id) });
  assert.deepEqual((await list()).data.map(w => w.name), ['Worker Ver', 'Other Ver']);
});

test('no non-admin route sends a worker\'s phone number to anyone else', { skip }, async () => {
  const job = await Job.create({
    client: users.viewer._id, worker: users.worker._id, category: 'tiler', area: 'remera',
    description: 'Tile floor', proposedPrice: 9000, agreedPrice: 9000, status: 'quote_accepted', acceptedAt: new Date()
  });
  await Job.create({ client: users.viewer._id, category: 'tiler', area: 'remera', description: 'Tile wall', proposedPrice: 7000 });
  try {
    const answers = await Promise.all([
      call('GET', '/api/discover?category=tiler', { as: 'viewer' }),
      call('GET', '/api/discover?category=tiler&area=remera', { as: 'viewer' }),
      call('GET', `/api/users/${users.worker._id}/profile`, { as: 'viewer' }),
      call('GET', `/api/users/${users.worker._id}/profile`, { as: 'other' }),
      call('POST', '/api/users/lookup', { body: { phone: '0788700002' } }),
      call('GET', '/api/jobs/mine', { as: 'viewer' }),
      call('GET', `/api/jobs/${job._id}`, { as: 'viewer' }),
      call('GET', '/api/jobs/feed?area=all&trade=any', { as: 'other' })
    ]);
    for (const { status, data } of answers) {
      assert.equal(status, 200);
      const text = JSON.stringify(data);
      for (const phone of ['788700002', '788700003']) assert.equal(text.includes(phone), false, `${phone} in ${text}`);
    }
    // the routes really answered about this worker and these jobs
    assert.ok(answers[0].data.some(w => w.name === 'Worker Ver'));
    assert.equal(answers[6].data.worker?.name, 'Worker Ver');
    assert.ok(answers[7].data.some(j => j.description === 'Tile wall'));
  } finally {
    await Job.deleteMany({});
  }
});

test('scripts/verifyUser.js verifies and revokes through the route, printing no name or phone', { skip }, async () => {
  const run = promisify(execFile);
  const script = fileURLToPath(new URL('../scripts/verifyUser.js', import.meta.url));
  const env = { ...process.env, API_URL: base, ADMIN_SECRET };
  const verified = await run(process.execPath, [script, '--phone', '0788700002'], { env });
  assert.match(verified.stdout, /^Verified: .*"verifiedStatus":"verified".*"verifiedBy":"researcher"/);
  assert.equal((await User.findById(users.worker._id).lean()).verificationMethod, 'in-person');
  const revoked = await run(process.execPath, [script, '--id', String(users.worker._id), '--revoke'], { env });
  assert.match(revoked.stdout, /^Revoked: .*"verifiedStatus":"unverified"/);
  for (const out of [verified.stdout, revoked.stdout]) {
    assert.equal(out.includes('0788700002'), false);
    assert.equal(out.includes('Worker Ver'), false);
  }
  await assert.rejects(run(process.execPath, [script, '--phone', '0788700002'], { env: { ...env, ADMIN_SECRET: 'wrong' } }), /Failed \(401\)/);
});
