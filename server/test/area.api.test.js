// The pilot area: one shared list (shared/areas.js), required at signup with
// no default, changeable in Profile, validated on the server, and the area a
// person chose is the one area trust ("Trusted in this area") uses. Also
// "Who invited you?" at signup: the inviter is found by exact phone number.
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

const call = async (method, path, { as, body, ip } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(as ? { authorization: `Bearer ${tokens[as]}` } : {}),
      ...(ip ? { 'x-forwarded-for': ip } : {}) // its own IP, so per-IP limits don't leak between tests
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};

const signup = async (phone, extra, ip) => {
  assert.equal((await call('POST', '/api/auth/otp', { body: { phone, purpose: 'register' }, ip })).status, 200);
  return call('POST', '/api/auth/register', {
    body: { role: 'client', name: 'New Person', phone, pin: '2468', otpCode: codes.get(phone.slice(-3)), ...extra },
    ip
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

// "Who invited you?": the inviter is identified by exact phone number, never
// by name, so a shared name can't attach the referral edge to the wrong person.

const NOT_FOUND = "We couldn't find that phone number. Check it or skip this step.";

// Two people with the same name, in different areas.
const sameName = async () => {
  const existing = await User.find({ name: 'Amina Uwase' }).sort({ phone: 1 }).lean();
  if (existing.length) return existing;
  return User.create([
    { name: 'Amina Uwase', phone: '0788600101', role: 'worker', area: 'kimironko', skills: ['tiler'] },
    { name: 'Amina Uwase', phone: '0788600102', role: 'client', area: 'remera' }
  ]);
};

// Everything console.log / console.error print while fn runs.
const logged = async fn => {
  const lines = [];
  const { log, error } = console;
  console.log = (...args) => { lines.push(args.join(' ')); log(...args); };
  console.error = (...args) => lines.push(args.join(' '));
  try { await fn(); } finally { Object.assign(console, { log, error }); }
  return lines.join('\n');
};

test('a referral attaches to the person whose phone was given, even when two people share a name', { skip }, async () => {
  const [first, second] = await sameName();
  const logs = await logged(async () => {
    const a = await signup('0788600111', { area: 'gikondo', referrerPhone: '0788 600 102' }, '10.70.1.1');
    assert.equal(a.status, 201);
    const b = await signup('0788600112', { area: 'gikondo', referrerPhone: '+250788600101' }, '10.70.1.2');
    assert.equal(b.status, 201);

    for (const [res, inviter, other] of [[a, second, first], [b, first, second]]) {
      const id = res.data.user._id;
      assert.equal(String((await User.findById(id).lean()).referredBy), String(inviter._id));
      const edges = await TrustEdge.find({ toUser: id }).lean();
      assert.equal(edges.length, 1);
      assert.equal(String(edges[0].fromUser), String(inviter._id)); // from the inviter to the new user
      assert.equal(edges[0].type, 'signup_referral');
      assert.equal(edges[0].weight, 1.0);
      assert.equal(await TrustEdge.exists({ fromUser: other._id, toUser: id }), null);
    }
  });
  assert.doesNotMatch(logs, /7886001\d\d/); // no phone number in any log line
});

test('signup refuses an unknown, partial or own inviter phone and creates nobody', { skip }, async () => {
  await sameName();
  const register = (phone, referrerPhone) => call('POST', '/api/auth/register', {
    body: { role: 'client', name: 'New Person', phone, area: 'remera', pin: '2468', otpCode: '000000', referrerPhone },
    ip: '10.70.2.1'
  });
  for (const referrerPhone of ['0788600999', '0788600', '600102', 'Amina Uwase']) {
    const res = await register('0788600121', referrerPhone);
    assert.equal(res.status, 400, referrerPhone);
    assert.equal(res.data.error, NOT_FOUND);
  }
  const own = await register('0788600122', '+250 788 600 122');
  assert.equal(own.status, 400);
  assert.equal(own.data.error, "You can't invite yourself.");
  assert.equal(await User.exists({ phone: { $in: ['0788600121', '0788600122'] } }), null);
});

test('the old referrerId is ignored: no referral is made from an id', { skip }, async () => {
  const [first] = await sameName();
  const res = await signup('0788600123', { area: 'remera', referrerId: String(first._id) }, '10.70.2.2');
  assert.equal(res.status, 201);
  assert.equal(res.data.user.referredBy, null);
  assert.equal(await TrustEdge.exists({ toUser: res.data.user._id }), null);
});

test('the inviter lookup matches a full number exactly and returns only name, area, role and the last 3 digits', { skip }, async () => {
  const [, second] = await sameName();
  const ip = '10.70.3.1';
  const res = await call('POST', '/api/users/lookup', { body: { phone: '0788 600 102' }, ip });
  assert.equal(res.status, 200);
  assert.deepEqual(res.data, { name: 'Amina U.', area: 'remera', role: 'client', phoneEnding: '102' });
  const raw = JSON.stringify(res.data);
  assert.doesNotMatch(raw, /788600102/);
  assert.doesNotMatch(raw, new RegExp(String(second._id)));

  // partial numbers and names: no match and no list
  for (const phone of ['0788600', '078860010', '600102', 'Amina', '', null, { $ne: '' }]) {
    const partial = await call('POST', '/api/users/lookup', { body: { phone }, ip: '10.70.3.2' });
    assert.equal(partial.status, 400, JSON.stringify(phone));
    assert.deepEqual(Object.keys(partial.data), ['error']);
  }
  const unknown = await call('POST', '/api/users/lookup', { body: { phone: '0788600999' }, ip });
  assert.equal(unknown.status, 404);
  assert.deepEqual(unknown.data, { error: NOT_FOUND });
  // the old name search is gone
  assert.equal((await call('GET', '/api/users/search?q=Amina', { ip })).status, 404);
});

test('inviter lookups are limited to 30 per IP per 15 minutes, and signup shares the limit', { skip }, async () => {
  await sameName();
  const ip = '10.70.4.1';
  for (let i = 0; i < 30; i++) {
    assert.equal((await call('POST', '/api/users/lookup', { body: { phone: '0788600101' }, ip })).status, 200, `lookup ${i + 1}`);
  }
  const limited = await call('POST', '/api/users/lookup', { body: { phone: '0788600101' }, ip });
  assert.equal(limited.status, 429);
  assert.deepEqual(limited.data, { error: 'Too many lookups. Please wait 15 minutes and try again.' });
  const viaSignup = await call('POST', '/api/auth/register', {
    body: { role: 'client', name: 'New Person', phone: '0788600131', area: 'remera', pin: '2468', otpCode: '000000', referrerPhone: '0788600101' },
    ip
  });
  assert.equal(viaSignup.status, 429);
  // another IP is unaffected
  assert.equal((await call('POST', '/api/users/lookup', { body: { phone: '0788600101' }, ip: '10.70.4.2' })).status, 200);
});
