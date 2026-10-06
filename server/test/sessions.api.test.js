// API tests for signed sessions. They start the real app against a throwaway
// database and are skipped unless TEST_MONGO_URI is set, so they never touch
// a real database by accident:
//   TEST_MONGO_URI=mongodb://127.0.0.1:27017/middleman_test npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const MONGO = process.env.TEST_MONGO_URI;
const skip = !MONGO && 'set TEST_MONGO_URI to run API tests';

let server, base, mongoose, User, hashPin, createSessionToken;
const codes = new Map(); // phone -> last OTP printed by the console provider

before(async () => {
  if (skip) return;
  if (!/test/i.test(MONGO)) throw new Error('TEST_MONGO_URI must point at a database with "test" in its name');
  process.env.SESSION_SECRET = 'api-test-secret';
  process.env.OTP_PROVIDER = 'console';
  const log = console.log;
  console.log = (...args) => {
    const m = String(args[0]).match(/^\[otp\] code for \+250(\d+) is (\d{6})$/);
    if (m) codes.set(`0${m[1]}`, m[2]); else log(...args);
  };

  mongoose = (await import('mongoose')).default;
  ({ default: User } = await import('../modules/users/user.model.js'));
  ({ hashPin } = await import('../modules/auth/pin.js'));
  ({ createSessionToken } = await import('../modules/auth/session.js'));
  const { default: app } = await import('../app.js');

  await mongoose.connect(MONGO);
  await mongoose.connection.dropDatabase();
  const pinHash = await hashPin('1234');
  await User.create([
    { name: 'Client One', phone: '0788100001', role: 'client', area: 'kimironko', pinHash },
    { name: 'Client Two', phone: '0788100002', role: 'client', area: 'gikondo', pinHash },
    { name: 'Worker One', phone: '0788100003', role: 'worker', area: 'kimironko', skills: ['electrician'], pinHash }
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

const call = async (method, path, { token, body, headers = {} } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};
const login = phone => call('POST', '/api/auth/login', { body: { phone, pin: '1234' } });

test('login returns a user and a session token that works', { skip }, async () => {
  const { status, data } = await login('0788100001');
  assert.equal(status, 200);
  assert.equal(data.user.name, 'Client One');
  assert.equal('pinHash' in data.user || 'sessionVersion' in data.user, false);
  assert.equal((await call('GET', '/api/jobs/mine', { token: data.token })).status, 200);
});

test('no token, a bare x-user-id header, or a malformed header gets 401', { skip }, async () => {
  const user = await User.findOne({ phone: '0788100001' });
  assert.equal((await call('GET', '/api/jobs/mine')).status, 401);
  assert.equal((await call('GET', '/api/jobs/mine', { headers: { 'x-user-id': String(user._id) } })).status, 401);
  assert.equal((await call('GET', '/api/jobs/mine', { headers: { authorization: 'Basic abc' } })).status, 401);
  assert.equal((await call('GET', '/api/jobs/mine', { token: 'not.a.token' })).status, 401);
});

test('a token edited to impersonate someone else gets 401', { skip }, async () => {
  const { data } = await login('0788100001');
  const other = await User.findOne({ phone: '0788100002' });
  const [h, p, s] = data.token.split('.');
  const payload = JSON.parse(Buffer.from(p, 'base64url'));
  const forged = Buffer.from(JSON.stringify({ ...payload, sub: String(other._id) })).toString('base64url');
  assert.equal((await call('GET', '/api/jobs/mine', { token: `${h}.${forged}.${s}` })).status, 401);
});

test('an expired token gets 401', { skip }, async () => {
  const user = await User.findOne({ phone: '0788100001' }).select('+sessionVersion');
  const old = createSessionToken(user, Date.now() - 24 * 3600 * 1000);
  assert.equal((await call('GET', '/api/jobs/mine', { token: old })).status, 401);
});

test('roles are enforced from the session', { skip }, async () => {
  const { data } = await login('0788100003');
  const res = await call('POST', '/api/jobs', { token: data.token, body: { category: 'electrician', description: 'x', area: 'kimironko', proposedPrice: 5000 } });
  assert.equal(res.status, 403);
});

test('discover ranks for the session user and ignores clientId in the URL', { skip }, async () => {
  const { data } = await login('0788100001');
  const other = await User.findOne({ phone: '0788100002' });
  assert.equal((await call('GET', '/api/discover?category=electrician')).status, 401);
  const res = await call('GET', `/api/discover?category=electrician&clientId=${other._id}`, { token: data.token });
  assert.equal(res.status, 200);
  assert.deepEqual(res.data.map(w => w.name), ['Worker One']);
});

test('registration returns a working session', { skip }, async () => {
  const phone = '0788100009';
  assert.equal((await call('POST', '/api/auth/otp', { body: { phone, purpose: 'register' } })).status, 200);
  const reg = await call('POST', '/api/auth/register', {
    body: { role: 'client', name: 'New Client', phone, area: 'remera', pin: '2468', otpCode: codes.get(phone) }
  });
  assert.equal(reg.status, 201);
  assert.equal((await call('GET', `/api/users/${reg.data.user._id}/profile`, { token: reg.data.token })).status, 200);
});

test('a PIN reset ends every older session and returns a new one', { skip }, async () => {
  const phone = '0788100002';
  const before = (await login(phone)).data.token;
  assert.equal((await call('GET', '/api/jobs/mine', { token: before })).status, 200);

  await call('POST', '/api/auth/otp', { body: { phone, purpose: 'pin_reset' } });
  const reset = await call('POST', '/api/auth/pin/reset', { body: { phone, code: codes.get(phone), pin: '9753' } });
  assert.equal(reset.status, 200);

  assert.equal((await call('GET', '/api/jobs/mine', { token: before })).status, 401);
  assert.equal((await call('GET', '/api/jobs/mine', { token: reset.data.token })).status, 200);
});
