// Private earnings on your own profile: a worker sees "Earned on Middleman",
// a client "Paid through Middleman", both from jobs the client confirmed
// whose escrow was released, and disputes settled by release. Refunded jobs
// and money still held in a dispute don't count. Nobody
// else sees it: not another user's view of the profile, Discover, offers or
// the admin lists. Needs TEST_MONGO_URI.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const MONGO = process.env.TEST_MONGO_URI && (() => {
  const url = new URL(process.env.TEST_MONGO_URI);
  url.pathname += '_earnings';
  return url.toString();
})();
const skip = !MONGO && 'set TEST_MONGO_URI to run API tests';
const ADMIN_SECRET = 'earnings-test-admin-secret';

let server, base, mongoose, users, tokens, openJob;

before(async () => {
  if (skip) return;
  if (!/test/i.test(MONGO)) throw new Error('TEST_MONGO_URI must point at a database with "test" in its name');
  process.env.SESSION_SECRET = 'api-test-secret';
  process.env.ADMIN_SECRET = ADMIN_SECRET;

  mongoose = (await import('mongoose')).default;
  const { default: User } = await import('../modules/users/user.model.js');
  const { default: Job } = await import('../modules/jobs/job.model.js');
  const { default: Quote } = await import('../modules/jobs/quote.model.js');
  const { createSessionToken } = await import('../modules/auth/session.js');
  const { default: app } = await import('../app.js');

  await mongoose.connect(MONGO);
  await mongoose.connection.dropDatabase();
  const [client, worker, other, stranger] = await User.create([
    { name: 'Clara Client', phone: '0788610001', role: 'client', area: 'remera' },
    { name: 'Walter Worker', phone: '0788610002', role: 'worker', area: 'remera', skills: ['plumber'] },
    { name: 'Olga Otherworker', phone: '0788610003', role: 'worker', area: 'remera', skills: ['plumber'] },
    { name: 'Sam Stranger', phone: '0788610004', role: 'client', area: 'remera' }
  ]);
  users = { client, worker, other, stranger };

  const job = (extra, escrow) => ({
    client: client._id, worker: worker._id, category: 'plumber', area: 'remera', description: 'Job', proposedPrice: 1000,
    agreedPrice: escrow.amount, ...extra, escrow: { provider: 'fake', currency: 'RWF', ...escrow }
  });
  await Job.create([
    job({ status: 'completed' }, { status: 'released', amount: 15000 }),
    job({ status: 'completed' }, { status: 'released', amount: 7000 }),
    job({ status: 'resolved' }, { status: 'refunded', amount: 9000 }),     // refunded after a dispute
    job({ status: 'disputed' }, { status: 'held', amount: 11000 }),        // disputed, money still held
    job({ status: 'resolved' }, { status: 'released', amount: 13000 }),    // dispute settled by release
    job({ status: 'completed', worker: other._id }, { status: 'released', amount: 4000 })
  ]);
  openJob = await Job.create({ client: client._id, category: 'plumber', area: 'remera', description: 'Open', proposedPrice: 5000 });
  await Quote.create({ job: openJob._id, worker: worker._id, amount: 5000, isCounter: false });

  tokens = {};
  for (const [key, u] of Object.entries(users)) tokens[key] = createSessionToken(await User.findById(u._id).select('+sessionVersion'));
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (skip) return;
  server.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const get = async (path, as, headers = {}) => {
  const res = await fetch(`${base}${path}`, { headers: { ...(as ? { authorization: `Bearer ${tokens[as]}` } : {}), ...headers } });
  assert.equal(res.status, 200, path);
  return res.json();
};
const profileOf = (who, as) => get(`/api/users/${users[who]._id}/profile`, as);

test('the worker sees what was released to them, dispute releases included; refunded and held jobs are left out', { skip }, async () => {
  assert.deepEqual((await profileOf('worker', 'worker')).earnings, { total: 35000, jobs: 3, sandbox: true });
});

test('the client sees what they paid through Middleman the same way', { skip }, async () => {
  // 15000 + 7000 + 13000 (dispute released) + 4000 to another worker
  assert.deepEqual((await profileOf('client', 'client')).earnings, { total: 39000, jobs: 4, sandbox: true });
});

test('nothing yet: zero, not missing', { skip }, async () => {
  assert.deepEqual((await profileOf('stranger', 'stranger')).earnings, { total: 0, jobs: 0, sandbox: true });
});

test('nobody else gets it: another user viewing the profile, Discover, offers, admin lists', { skip }, async () => {
  for (const [who, as] of [['worker', 'client'], ['worker', 'stranger'], ['client', 'worker'], ['client', 'stranger']]) {
    assert.equal('earnings' in await profileOf(who, as), false, `${as} viewing ${who}`);
  }
  const responses = [
    await get('/api/discover?category=plumber', 'client'),
    await get(`/api/jobs/${openJob._id}`, 'client'),
    await get('/api/admin/verification/unverified', null, { 'x-admin-secret': ADMIN_SECRET }),
    await get('/api/admin/disputes', null, { 'x-admin-secret': ADMIN_SECRET })
  ];
  for (const body of responses) assert.equal(JSON.stringify(body).includes('earnings'), false);
});
