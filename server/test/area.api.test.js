// The pilot area: one shared list (shared/areas.js), required at signup with
// no default, changeable in Profile, validated on the server, and the area a
// person chose is the one area trust ("Trusted in this area") uses.
// The config test always runs; the API tests need TEST_MONGO_URI.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AREAS as SHARED, AREA_VALUES } from '../../shared/areas.js';
import { COPIES, SOURCE, generated } from '../../scripts/syncShared.mjs';
import { AREAS as SERVER_AREAS } from '../config/areas.js';

test('one shared list of exactly the four pilot areas feeds the server, the models and the app', async () => {
  assert.deepEqual(SHARED.map(a => a.label), ['Kimironko', 'Kwa Nayinzira', 'Remera', 'Gikondo']);
  assert.deepEqual(SERVER_AREAS, AREA_VALUES);
  const { default: User } = await import('../modules/users/user.model.js');
  const { default: Job } = await import('../modules/jobs/job.model.js');
  assert.deepEqual(User.schema.path('area').enumValues, [...AREA_VALUES]);
  assert.deepEqual(Job.schema.path('area').enumValues, [...AREA_VALUES]);
  // The app reads the generated copy instead of keeping its own list.
  const options = readFileSync(new URL('../../client/src/options.js', import.meta.url), 'utf8');
  assert.match(options, /from '\.\/areas\.shared\.js'/);
  assert.doesNotMatch(options, /value: 'kimironko'/);
});

test('the copies in server/ and client/ match shared/areas.js (run `npm run sync:shared` after editing it)', () => {
  const root = new URL('../../', import.meta.url);
  const expected = generated(readFileSync(new URL(SOURCE, root), 'utf8'));
  for (const copy of COPIES) assert.equal(readFileSync(new URL(copy, root), 'utf8'), expected, `${copy} is out of date`);
});

test('nothing deployed from server/ or client/ imports from outside its own folder', () => {
  const offenders = [];
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', 'test', 'dist'].includes(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(js|jsx|mjs)$/.test(entry.name)) {
        for (const [, spec] of readFileSync(path, 'utf8').matchAll(/(?:from|import\()\s*['"](\.[^'"]+)['"]/g)) {
          const top = fileURLToPath(new URL(`../../${dir.includes('/client/') ? 'client' : 'server'}/`, import.meta.url));
          if (!resolve(dirname(path), spec).startsWith(top)) offenders.push(`${path}: ${spec}`);
        }
      }
    }
  };
  walk(fileURLToPath(new URL('../', import.meta.url)));
  walk(fileURLToPath(new URL('../../client/src/', import.meta.url)));
  assert.deepEqual(offenders, []);
});

test('signup has no preselected area and uses the shared picker', () => {
  const register = readFileSync(new URL('../../client/src/pages/Register.jsx', import.meta.url), 'utf8');
  assert.match(register, /area: ''/);
  assert.doesNotMatch(register, /area: '(kimironko|kwa_nayinzira|remera|gikondo)'/);
  assert.match(register, /<AreaPicker/);
  assert.match(register, /if \(!details\.area\) return setError\('Choose your area\.'\)/);
});

const MONGO = process.env.TEST_MONGO_URI && (() => {
  const url = new URL(process.env.TEST_MONGO_URI);
  url.pathname += '_area';
  return url.toString();
})();
const skip = !MONGO && 'set TEST_MONGO_URI to run API tests';

let server, base, mongoose, User, TrustEdge, users, tokens;
const codes = new Map(); // last 3 digits -> last OTP printed by the console provider

before(async () => {
  if (skip) return;
  if (!/test/i.test(MONGO)) throw new Error('TEST_MONGO_URI must point at a database with "test" in its name');
  process.env.SESSION_SECRET = 'api-test-secret';
  process.env.OTP_PROVIDER = 'console';
  const log = console.log;
  console.log = (...args) => {
    const m = String(args[0]).match(/^\[otp\] code for \+250\*{5}(\d{3}) is (\d{6})$/);
    if (m) codes.set(m[1], m[2]); else log(...args);
  };

  mongoose = (await import('mongoose')).default;
  ({ default: User } = await import('../modules/users/user.model.js'));
  ({ default: TrustEdge } = await import('../modules/trust/trustEdge.model.js'));
  const { createSessionToken } = await import('../modules/auth/session.js');
  const { default: app } = await import('../app.js');

  await mongoose.connect(MONGO);
  await mongoose.connection.dropDatabase();
  await Promise.all([User, TrustEdge].map(M => M.createIndexes()));
  const [worker, rater, viewer] = await User.create([
    { name: 'Worker Area', phone: '0788600001', role: 'worker', area: 'remera', skills: ['plumber'] },
    { name: 'Rater Area', phone: '0788600002', role: 'client', area: 'remera' },
    { name: 'Viewer Area', phone: '0788600003', role: 'client', area: 'gikondo' }
  ]);
  users = { worker, rater, viewer };
  tokens = Object.fromEntries(await Promise.all(Object.entries(users).map(async ([k, u]) => {
    const full = await User.findById(u._id).select('+sessionVersion');
    return [k, createSessionToken(full)];
  })));
  // A 4-star rating from the rater to the worker; the viewer has no path to either.
  await TrustEdge.create({ fromUser: rater._id, toUser: worker._id, type: 'rating', weight: 0.8 });

  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (skip) return;
  server.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const call = async (method, path, { as, body } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(as ? { authorization: `Bearer ${tokens[as]}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};

const signup = async (phone, extra) => {
  assert.equal((await call('POST', '/api/auth/otp', { body: { phone, purpose: 'register' } })).status, 200);
  return call('POST', '/api/auth/register', {
    body: { role: 'client', name: 'New Person', phone, pin: '2468', otpCode: codes.get(phone.slice(-3)), ...extra }
  });
};

test('signup without an area, or with one outside the pilot list, is refused and creates nobody', { skip }, async () => {
  for (const [phone, extra] of [['0788600011', {}], ['0788600012', { area: '' }], ['0788600013', { area: 'nyamirambo' }], ['0788600014', { area: 'Kimironko' }]]) {
    const res = await signup(phone, extra);
    assert.equal(res.status, 400, JSON.stringify(extra));
    assert.equal(res.data.error, 'Choose your area');
    assert.equal(await User.exists({ phone: `+250${phone.slice(1)}` }), null);
  }
});

test('signup keeps the chosen area, for clients and workers alike', { skip }, async () => {
  const client = await signup('0788600021', { area: 'kwa_nayinzira' });
  assert.equal(client.status, 201);
  assert.equal(client.data.user.area, 'kwa_nayinzira');
  const worker = await signup('0788600022', { role: 'worker', skills: ['tiler'], area: 'gikondo' });
  assert.equal(worker.status, 201);
  assert.equal(worker.data.user.area, 'gikondo');
});

test('PATCH /api/users/me changes only your own area, and only to a pilot area', { skip }, async () => {
  assert.equal((await call('PATCH', '/api/users/me', { body: { area: 'gikondo' } })).status, 401);
  for (const area of ['nyamirambo', '', null, ['remera'], { $ne: 'x' }]) {
    assert.equal((await call('PATCH', '/api/users/me', { as: 'viewer', body: { area } })).status, 400, JSON.stringify(area));
  }
  const res = await call('PATCH', '/api/users/me', { as: 'viewer', body: { area: 'kimironko', role: 'worker', phone: '0788999999', verifiedStatus: 'verified' } });
  assert.equal(res.status, 200);
  assert.equal(res.data.user.area, 'kimironko');
  const stored = await User.findById(users.viewer._id).select('+pinHash').lean();
  assert.deepEqual([stored.area, stored.role, stored.phone, stored.verifiedStatus], ['kimironko', 'client', users.viewer.phone, 'unverified']);
  assert.equal('pinHash' in res.data.user, false);
  assert.equal('sessionVersion' in res.data.user, false);
  await call('PATCH', '/api/users/me', { as: 'viewer', body: { area: 'gikondo' } });
});

test('area trust follows the areas people chose: a same-area rater makes "Trusted in this area"', { skip }, async () => {
  const tier = async () => (await call('GET', '/api/discover?category=plumber', { as: 'viewer' })).data.find(w => String(w._id) === String(users.worker._id)).trustSource;
  assert.equal(await tier(), 'area'); // worker and rater both chose Remera

  assert.equal((await call('PATCH', '/api/users/me', { as: 'worker', body: { area: 'gikondo' } })).status, 200);
  assert.equal(await tier(), 'fallback'); // the rater is no longer in the worker's area

  assert.equal((await call('PATCH', '/api/users/me', { as: 'rater', body: { area: 'gikondo' } })).status, 200);
  assert.equal(await tier(), 'area'); // the same rating counts again once they share an area
});

test('the chosen area is the worker\'s default job view', { skip }, async () => {
  const { default: Job } = await import('../modules/jobs/job.model.js');
  await Job.create([
    { client: users.rater._id, area: 'gikondo', category: 'plumber', description: 'Gikondo tap', proposedPrice: 5000 },
    { client: users.rater._id, area: 'remera', category: 'plumber', description: 'Remera tap', proposedPrice: 5000 }
  ]);
  const feed = async () => (await call('GET', '/api/jobs/feed', { as: 'worker' })).data.map(j => j.description);
  await call('PATCH', '/api/users/me', { as: 'worker', body: { area: 'gikondo' } });
  assert.deepEqual(await feed(), ['Gikondo tap']);
  await call('PATCH', '/api/users/me', { as: 'worker', body: { area: 'remera' } });
  assert.deepEqual(await feed(), ['Remera tap']);
});
