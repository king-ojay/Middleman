// The worker's job list (GET /api/jobs/feed): filters, sort, "you responded",
// who may respond, and that no personal data of clients leaves the server.
// feedQuery unit tests always run; the API tests need TEST_MONGO_URI.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { feedQuery } from '../modules/jobs/feed.js';

const MONGO = process.env.TEST_MONGO_URI && (() => {
  const url = new URL(process.env.TEST_MONGO_URI);
  url.pathname += '_feed';
  return url.toString();
})();
const skip = !MONGO && 'set TEST_MONGO_URI to run API tests';

const WORKER = { area: 'remera', skills: ['plumber', 'phone_repair'] };

test('feedQuery: no parameters is the original feed (own area, own trades, open, newest first)', () => {
  const { filter, sort } = feedQuery(WORKER, {});
  assert.deepEqual(filter, { status: 'open', area: 'remera', category: { $in: ['plumber', 'phone_repair'] } });
  assert.deepEqual(sort, { createdAt: -1, _id: -1 });
});

test('feedQuery: unknown or repeated parameters are refused with 400', () => {
  for (const query of [{ area: 'nairobi' }, { trade: 'astronaut' }, { sort: 'oldest' }, { area: ['remera', 'gikondo'] }, { q: ['a', 'b'] }]) {
    assert.throws(() => feedQuery(WORKER, query), err => err.status === 400, JSON.stringify(query));
  }
});

test('feedQuery: search text is matched literally, never as a pattern, and capped', () => {
  const { filter } = feedQuery(WORKER, { q: '  (a+.*  ' });
  assert.equal(filter.$or[0].description.$regex, '\\(a\\+\\.\\*');
  assert.equal(feedQuery(WORKER, { q: 'x'.repeat(500) }).filter.$or[0].description.$regex.length, 100);
});

let server, base, mongoose, Job, Quote, users, tokens, jobs;

before(async () => {
  if (skip) return;
  if (!/test/i.test(MONGO)) throw new Error('TEST_MONGO_URI must point at a database with "test" in its name');
  process.env.SESSION_SECRET = 'api-test-secret';

  mongoose = (await import('mongoose')).default;
  const { default: User } = await import('../modules/users/user.model.js');
  ({ default: Job } = await import('../modules/jobs/job.model.js'));
  ({ default: Quote } = await import('../modules/jobs/quote.model.js'));
  const { createSessionToken } = await import('../modules/auth/session.js');
  const { default: app } = await import('../app.js');

  await mongoose.connect(MONGO);
  await mongoose.connection.dropDatabase();
  await Promise.all([User, Job, Quote].map(M => M.createIndexes()));
  const [client, worker] = await User.create([
    { name: 'Client Feed', phone: '0788500001', role: 'client', area: 'gikondo', verifiedStatus: 'verified' },
    { name: 'Worker Feed', phone: '0788500002', role: 'worker', area: 'remera', skills: ['plumber', 'phone_repair'] }
  ]);
  users = { client, worker };
  tokens = Object.fromEntries(await Promise.all(Object.entries(users).map(async ([k, u]) => {
    const full = await User.findById(u._id).select('+sessionVersion');
    return [k, createSessionToken(full)];
  })));

  // Oldest first, so "newest" is the reverse of this list.
  const spec = [
    ['remera', 'plumber', 'Leaking tap in the kitchen', 8000],
    ['remera', 'electrician', 'Rewire two sockets', 30000],
    ['gikondo', 'plumber', 'Blocked shower drain', 12000],
    ['remera', 'phone_repair', 'Cracked screen', 20000],
    ['kimironko', 'mason', 'Garden wall (small)', 50000],
    ['remera', 'plumber', 'Install a water tank', 15000]
  ];
  jobs = [];
  for (const [i, [area, category, description, proposedPrice]] of spec.entries()) {
    jobs.push(await Job.create({ client: client._id, area, category, description, proposedPrice, createdAt: new Date(Date.UTC(2026, 9, 1, 8, i)) }));
  }
  await Job.create({ client: client._id, area: 'remera', category: 'plumber', description: 'Already taken tap job', proposedPrice: 9000, status: 'quote_accepted' });

  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (skip) return;
  server.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const call = async (method, path, as, body) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${tokens[as]}` },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};
const feed = async (query = '') => {
  const res = await call('GET', `/api/jobs/feed${query}`, 'worker');
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res.data;
};
const descriptions = list => list.map(j => j.description);

test('default view: open jobs in the worker\'s own area and trades, newest first', { skip }, async () => {
  assert.deepEqual(descriptions(await feed()), ['Install a water tank', 'Cracked screen', 'Leaking tap in the kitchen']);
});

test('area filter: one pilot area, all pilot areas; unknown area is 400', { skip }, async () => {
  assert.deepEqual(descriptions(await feed('?area=gikondo')), ['Blocked shower drain']);
  assert.deepEqual(descriptions(await feed('?area=all')), ['Install a water tank', 'Cracked screen', 'Blocked shower drain', 'Leaking tap in the kitchen']);
  assert.equal((await call('GET', '/api/jobs/feed?area=nairobi', 'worker')).status, 400);
});

test('trade filter: any trade, one trade; combined with area', { skip }, async () => {
  assert.deepEqual(descriptions(await feed('?trade=any')), ['Install a water tank', 'Cracked screen', 'Rewire two sockets', 'Leaking tap in the kitchen']);
  assert.deepEqual(descriptions(await feed('?trade=mason&area=all')), ['Garden wall (small)']);
  assert.equal((await call('GET', '/api/jobs/feed?trade=astronaut', 'worker')).status, 400);
});

test('search: description words in any case, trade names, and pattern characters taken literally', { skip }, async () => {
  assert.deepEqual(descriptions(await feed('?area=all&q=TAP')), ['Leaking tap in the kitchen']);
  assert.deepEqual(descriptions(await feed('?area=all&q=phone%20repair')), ['Cracked screen']);
  assert.deepEqual(descriptions(await feed('?area=all&trade=any&q=(small)')), ['Garden wall (small)']);
  assert.deepEqual(await feed('?q=.*'), []);
});

test('sort by price, highest or lowest first; unknown sort is 400', { skip }, async () => {
  assert.deepEqual((await feed('?area=all&sort=price_high')).map(j => j.proposedPrice), [20000, 15000, 12000, 8000]);
  assert.deepEqual((await feed('?area=all&sort=price_low')).map(j => j.proposedPrice), [8000, 12000, 15000, 20000]);
  assert.equal((await call('GET', '/api/jobs/feed?sort=oldest', 'worker')).status, 400);
});

test('a worker may respond in any pilot area but only in their own trades; responded jobs stay listed and labelled', { skip }, async () => {
  const otherArea = jobs[2]; // gikondo plumber
  const otherTrade = jobs[1]; // remera electrician
  const listed = await feed('?area=all&trade=any');
  assert.equal(listed.find(j => j.description === otherArea.description).canRespond, true);
  assert.equal(listed.find(j => j.description === otherTrade.description).canRespond, false);

  assert.equal((await call('POST', `/api/jobs/${otherTrade._id}/responses`, 'worker', {})).status, 403);
  assert.equal((await call('POST', `/api/jobs/${otherArea._id}/responses`, 'worker', { amount: 13000 })).status, 201);

  const mine = (await feed('?area=gikondo'))[0];
  assert.equal(mine.description, otherArea.description);
  assert.deepEqual({ amount: mine.myResponse.amount, isCounter: mine.myResponse.isCounter }, { amount: 13000, isCounter: true });
});

test('privacy: the list carries only job fields, the client\'s id, name and area, and the tier; no phone or other personal data', { skip }, async () => {
  const res = await call('GET', '/api/jobs/feed?area=all&trade=any', 'worker');
  const text = JSON.stringify(res.data);
  for (const secret of ['0788500001', '250788500001', 'verifiedStatus', 'pinHash', 'sessionVersion', 'referredBy', '"phone"', 'escrow']) {
    assert.equal(text.includes(secret), false, `feed contains ${secret}`);
  }
  for (const job of res.data) {
    assert.deepEqual(Object.keys(job).sort(), ['_id', 'area', 'canRespond', 'category', 'client', 'clientTrust', 'createdAt', 'description', 'myResponse', 'proposedPrice', 'status']);
    assert.deepEqual(Object.keys(job.client).sort(), ['_id', 'area', 'name']);
    assert.equal(typeof job.clientTrust, 'string');
  }
});

test('only workers get a job list', { skip }, async () => {
  assert.equal((await call('GET', '/api/jobs/feed', 'client')).status, 403);
});
