// Consent for accounts from before it was asked for (or after the policy
// changes): such a user can log in, but every logged-in route answers 403
// consent_required until they agree through POST /api/auth/consent, which
// stores the same three things sign-up does. Needs TEST_MONGO_URI.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { POLICY_VERSION } from '../config/policy.shared.js';

const MONGO = process.env.TEST_MONGO_URI && (() => {
  const url = new URL(process.env.TEST_MONGO_URI);
  url.pathname += '_consentgate';
  return url.toString();
})();
const skip = !MONGO && 'set TEST_MONGO_URI to run API tests';
const CONSENT = { ageConfirmed: true, policyAccepted: true, policyVersion: POLICY_VERSION };

let server, base, mongoose, User;

before(async () => {
  if (skip) return;
  if (!/test/i.test(MONGO)) throw new Error('TEST_MONGO_URI must point at a database with "test" in its name');
  process.env.SESSION_SECRET = 'api-test-secret';
  mongoose = (await import('mongoose')).default;
  ({ default: User } = await import('../modules/users/user.model.js'));
  const { hashPin } = await import('../modules/auth/pin.js');
  const { default: app } = await import('../app.js');
  await mongoose.connect(MONGO);
  await mongoose.connection.dropDatabase();
  await User.createIndexes();
  const pinHash = await hashPin('1234');
  await User.create([
    // from before consent was asked for
    { name: 'Olive Mukamana', phone: '0788680001', role: 'client', area: 'remera', pinHash },
    // agreed to an older policy
    { name: 'Paul Habimana', phone: '0788680002', role: 'worker', area: 'remera', skills: ['plumber'], pinHash, policyVersion: '0.9', consentedAt: new Date('2026-01-01'), ageConfirmed: true }
  ]);
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (skip) return;
  server.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function call(method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const login = async phone => (await call('POST', '/api/auth/login', { body: { phone, pin: '1234' } })).data;
const ROUTES = [['GET', '/api/jobs/mine'], ['GET', '/api/discover?category=plumber'], ['GET', '/api/transactions'], ['PATCH', '/api/users/me']];

test('an account without consent can log in, but every other route waits for it', { skip }, async () => {
  const { user, token } = await login('0788680001');
  assert.ok(token);
  assert.equal(user.policyVersion, null); // the app sees this and shows its consent screen
  for (const [method, path] of ROUTES) {
    const res = await call(method, path, { token, body: method === 'PATCH' ? { area: 'kimironko' } : undefined });
    assert.equal(res.status, 403, path);
    assert.equal(res.data.code, 'consent_required', path);
  }
  // Auth routes still answer (codes, login).
  assert.equal((await call('POST', '/api/auth/otp', { body: { phone: '0788680099', purpose: 'register' } })).status, 200);
});

test('consent needs a session and both boxes for the current policy', { skip }, async () => {
  assert.equal((await call('POST', '/api/auth/consent', { body: CONSENT })).status, 401);
  const { token } = await login('0788680001');
  for (const [body, code] of [
    [{ ...CONSENT, ageConfirmed: false }, 'age_required'],
    [{ ...CONSENT, policyAccepted: false }, 'policy_required'],
    [{ ...CONSENT, policyVersion: '0.9' }, 'policy_required']
  ]) {
    const res = await call('POST', '/api/auth/consent', { token, body });
    assert.equal(res.status, 400);
    assert.equal(res.data.code, code);
  }
  assert.equal((await User.findOne({ phone: '0788680001' }).lean()).policyVersion, null);
});

test('after consent the version, time and age are stored and the app opens up', { skip }, async () => {
  const { token } = await login('0788680001');
  const started = Date.now();
  const res = await call('POST', '/api/auth/consent', { token, body: CONSENT });
  assert.equal(res.status, 200);
  assert.equal(res.data.user.policyVersion, POLICY_VERSION);
  assert.equal('pinHash' in res.data.user, false);
  const stored = await User.findOne({ phone: '0788680001' }).lean();
  assert.equal(stored.policyVersion, POLICY_VERSION);
  assert.equal(stored.ageConfirmed, true);
  assert.ok(stored.consentedAt.getTime() >= started);
  for (const [method, path] of ROUTES.filter(([m]) => m === 'GET')) {
    assert.equal((await call(method, path, { token })).status, 200, path);
  }
});

test('consent to an older policy version counts as none', { skip }, async () => {
  const { user, token } = await login('0788680002');
  assert.equal(user.policyVersion, '0.9');
  assert.equal((await call('GET', '/api/jobs/mine', { token })).data.code, 'consent_required');
  assert.equal((await call('POST', '/api/auth/consent', { token, body: CONSENT })).status, 200);
  assert.equal((await call('GET', '/api/jobs/mine', { token })).status, 200);
});
