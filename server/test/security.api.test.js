// API tests for login limits, CORS and the rating transactions. Like
// sessions.api.test.js they run the real app against a throwaway database and
// are skipped unless TEST_MONGO_URI is set. Transactions need a replica set,
// so start the test mongod as a one-node replica set:
//   mongod --replSet rs0 --port 27017 --dbpath <dir>   (then rs.initiate() once)
//   TEST_MONGO_URI='mongodb://127.0.0.1:27017/middleman_test?directConnection=true' npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { allowedOrigins, DEV_ORIGINS } from '../config/cors.js';

// Its own database (TEST_MONGO_URI's name + "_security"): node --test runs
// files in parallel, and sessions.api.test.js drops the shared one.
const MONGO = process.env.TEST_MONGO_URI && (() => {
  const url = new URL(process.env.TEST_MONGO_URI);
  url.pathname += '_security';
  return url.toString();
})();
const skip = !MONGO && 'set TEST_MONGO_URI to run API tests';

let server, base, mongoose, User, Job, Rating, TrustEdge, users;
const realDateNow = Date.now;

before(async () => {
  if (skip) return;
  if (!/test/i.test(MONGO)) throw new Error('TEST_MONGO_URI must point at a database with "test" in its name');
  process.env.SESSION_SECRET = 'api-test-secret';
  process.env.CORS_ORIGINS = 'https://app.example.org';

  mongoose = (await import('mongoose')).default;
  ({ default: User } = await import('../modules/users/user.model.js'));
  ({ default: Job } = await import('../modules/jobs/job.model.js'));
  ({ default: Rating } = await import('../modules/trust/rating.model.js'));
  ({ default: TrustEdge } = await import('../modules/trust/trustEdge.model.js'));
  const { hashPin } = await import('../modules/auth/pin.js');
  const { default: app } = await import('../app.js');

  await mongoose.connect(MONGO);
  await mongoose.connection.dropDatabase();
  await Promise.all([User, Job, Rating, TrustEdge].map(M => M.createIndexes()));
  const pinHash = await hashPin('1234');
  const [client, worker] = await User.create([
    { name: 'Client Sec', phone: '0788200001', role: 'client', area: 'kimironko', pinHash },
    { name: 'Worker Sec', phone: '0788200002', role: 'worker', area: 'kimironko', skills: ['plumber'], pinHash },
    { name: 'Lock Me', phone: '0788200003', role: 'client', area: 'remera', pinHash },
    { name: 'Clear Me', phone: '0788200004', role: 'client', area: 'remera', pinHash }
  ]);
  users = { client, worker };
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (skip) return;
  Date.now = realDateNow;
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
  return { status: res.status, headers: res.headers, data: await res.json().catch(() => null) };
};
// Each test logs in from its own IP so the per-IP limit doesn't leak between tests.
const login = (phone, pin, ip) => call('POST', '/api/auth/login', { body: { phone, pin }, headers: { 'x-forwarded-for': ip } });
const statuses = async (phone, pin, ip, n) => {
  const out = [];
  for (let i = 0; i < n; i++) out.push(await login(phone, pin, ip));
  return out;
};

// 1. Login limits

test('5 wrong PINs lock the phone for 15 minutes, even for the right PIN, then it unlocks', { skip }, async () => {
  const tries = await statuses('0788200003', '0000', '10.0.0.1', 5);
  assert.deepEqual(tries.map(t => t.status), [401, 401, 401, 401, 429]);
  // locked: the right PIN from another IP is refused too
  assert.equal((await login('0788200003', '1234', '10.0.0.2')).status, 429);

  const start = realDateNow();
  Date.now = () => start + 14 * 60 * 1000;
  assert.equal((await login('0788200003', '1234', '10.0.0.3')).status, 429);
  Date.now = () => start + 15 * 60 * 1000 + 1000;
  assert.equal((await login('0788200003', '1234', '10.0.0.3')).status, 200);
  Date.now = realDateNow;
});

test('an unknown number gets exactly the same answers and lockout as a real one', { skip }, async () => {
  const known = await statuses('0788200001', '0000', '10.0.1.1', 6);
  const unknown = await statuses('0788299999', '0000', '10.0.1.2', 6);
  assert.deepEqual(unknown.map(t => [t.status, t.data]), known.map(t => [t.status, t.data]));
  assert.deepEqual(known.map(t => t.status), [401, 401, 401, 401, 429, 429]);
  assert.equal(known[0].data.error, 'That phone number and PIN do not match');
  assert.equal(known[5].data.error, 'Too many attempts. Please wait 15 minutes and try again.');
  // clean up so later tests can log in as the client
  Date.now = () => realDateNow() + 16 * 60 * 1000;
  assert.equal((await login('0788200001', '1234', '10.0.1.3')).status, 200);
  Date.now = realDateNow;
});

test('a successful login clears the phone\'s failed attempts', { skip }, async () => {
  await statuses('0788200004', '0000', '10.0.2.1', 4);
  assert.equal((await login('0788200004', '1234', '10.0.2.1')).status, 200);
  const after = await statuses('0788200004', '0000', '10.0.2.1', 4);
  assert.deepEqual(after.map(t => t.status), [401, 401, 401, 401]);
});

test('20 failures from one IP lock that IP for every phone number', { skip }, async () => {
  const ip = '10.0.3.1';
  // 20 different unknown numbers, 1 failure each: no phone reaches 5
  for (let i = 0; i < 19; i++) assert.equal((await login(`07883000${String(i).padStart(2, '0')}`, '0000', ip)).status, 401);
  assert.equal((await login('0788300099', '0000', ip)).status, 429);
  assert.equal((await login('0788200002', '1234', ip)).status, 429);       // right PIN, locked IP
  assert.equal((await login('0788200002', '1234', '10.0.3.2')).status, 200); // other IPs unaffected
});

// 2. CORS

test('CORS: listed and dev origins are allowed; any other origin gets 403; no Origin passes', { skip }, async () => {
  const ok = await call('GET', '/api/health', { headers: { origin: 'https://app.example.org' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://app.example.org');
  assert.equal((await call('GET', '/api/health', { headers: { origin: 'http://localhost:5173' } })).status, 200);

  const evil = await call('GET', '/api/health', { headers: { origin: 'https://evil.example.com' } });
  assert.equal(evil.status, 403);
  assert.equal(evil.headers.get('access-control-allow-origin'), null);
  const preflight = await call('OPTIONS', '/api/auth/login', {
    headers: { origin: 'https://evil.example.com', 'access-control-request-method': 'POST' }
  });
  assert.equal(preflight.status, 403);

  assert.equal((await call('GET', '/api/health')).status, 200);
});

test('CORS config: production allows only CORS_ORIGINS and refuses to start without it', () => {
  assert.deepEqual([...allowedOrigins({ NODE_ENV: 'production', CORS_ORIGINS: 'https://a.example, https://b.example/' })], ['https://a.example', 'https://b.example']);
  assert.throws(() => allowedOrigins({ NODE_ENV: 'production' }), /CORS_ORIGINS must be set/);
  assert.deepEqual([...allowedOrigins({ CORS_ORIGINS: 'https://a.example' })], ['https://a.example', ...DEV_ORIGINS]);
});

// 5. Transactions

// Escrow already held (the fake payment provider pays out on confirm).
const awaitingJob = () => Job.create({
  client: users.client._id, worker: users.worker._id, category: 'plumber', area: 'kimironko',
  description: 'Fix tap', proposedPrice: 10000, agreedPrice: 10000,
  status: 'awaiting_confirmation', workerCompletedAt: new Date(),
  escrow: { status: 'held', amount: 10000, currency: 'RWF', provider: 'fake' }
});
// Confirmed and paid out: both parties may rate.
const settledJob = () => Job.create({
  client: users.client._id, worker: users.worker._id, category: 'plumber', area: 'kimironko',
  description: 'Fix tap', proposedPrice: 10000, agreedPrice: 10000,
  status: 'completed', workerCompletedAt: new Date(), completedAt: new Date(),
  escrow: { status: 'released', amount: 10000, currency: 'RWF', provider: 'fake' }
});
const tokenFor = async phone => (await login(phone, '1234', `10.9.${phone.slice(-2)}.1`)).data.token;

// Makes the next trust-edge write fail inside the transaction.
const failNextEdgeWrite = () => {
  const original = TrustEdge.create;
  TrustEdge.create = async () => { TrustEdge.create = original; throw new Error('simulated edge write failure'); };
};

test('confirm + rating: a failed rating write after the payout leaves the job paid and unrated, and resending confirm rates it', { skip }, async () => {
  const job = await awaitingJob();
  const token = await tokenFor('0788200001');
  const edges = () => TrustEdge.countDocuments({ fromUser: users.client._id, toUser: users.worker._id });
  const before = await edges();

  failNextEdgeWrite();
  const failed = await call('POST', `/api/jobs/${job._id}/confirm`, { token, body: { score: 5 } });
  assert.equal(failed.status, 500);
  // the money has moved, so the confirmation stands; the rating and its edge were written together or not at all
  const paid = await Job.findById(job._id);
  assert.equal(paid.status, 'completed');
  assert.equal(paid.escrow.status, 'released');
  assert.equal(await Rating.countDocuments({ job: job._id }), 0);
  assert.equal(await edges(), before);

  const retried = await call('POST', `/api/jobs/${job._id}/confirm`, { token, body: { score: 5 } });
  assert.equal(retried.status, 200);
  assert.equal(await Rating.countDocuments({ job: job._id, fromUser: users.client._id }), 1);
  assert.equal(await edges(), before + 1);
});

test('rating + trust edge is one unit: a failed edge write stores no rating, so the worker can rate again', { skip }, async () => {
  const job = await settledJob();
  const token = await tokenFor('0788200002');
  const edges = () => TrustEdge.countDocuments({ fromUser: users.worker._id, toUser: users.client._id });
  const before = await edges();

  failNextEdgeWrite();
  assert.equal((await call('POST', `/api/jobs/${job._id}/rate-client`, { token, body: { score: 4 } })).status, 500);
  assert.equal(await Rating.countDocuments({ job: job._id, fromUser: users.worker._id }), 0);
  assert.equal(await edges(), before);

  assert.equal((await call('POST', `/api/jobs/${job._id}/rate-client`, { token, body: { score: 4 } })).status, 201);
  // a second rating of the same job is refused and writes no second edge
  assert.equal((await call('POST', `/api/jobs/${job._id}/rate-client`, { token, body: { score: 4 } })).status, 409);
  assert.equal(await Rating.countDocuments({ job: job._id, fromUser: users.worker._id }), 1);
  assert.equal(await edges(), before + 1);
});
