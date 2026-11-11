// Why each worker ranks where they do (reason.js), on Discover and on the
// offers a client sees on their own open job: the strongest path with only
// the hop-1 person's and the worker's first names, area raters, or new with
// verified and join month. Never a score, weight, phone number or the id of
// anyone on a path. Order and tiers are the same as without explanations.
// Needs TEST_MONGO_URI.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const MONGO = process.env.TEST_MONGO_URI && (() => {
  const url = new URL(process.env.TEST_MONGO_URI);
  url.pathname += '_reason';
  return url.toString();
})();
const skip = !MONGO && 'set TEST_MONGO_URI to run API tests';

let server, base, mongoose, rankByTrust, people, workers, job;

const march = new Date('2026-03-14T10:00:00Z');
const april = new Date('2026-04-02T10:00:00Z');

before(async () => {
  if (skip) return;
  if (!/test/i.test(MONGO)) throw new Error('TEST_MONGO_URI must point at a database with "test" in its name');
  process.env.SESSION_SECRET = 'api-test-secret';

  mongoose = (await import('mongoose')).default;
  const { default: User } = await import('../modules/users/user.model.js');
  const { default: TrustEdge } = await import('../modules/trust/trustEdge.model.js');
  const { default: Rating } = await import('../modules/trust/rating.model.js');
  const { default: Job } = await import('../modules/jobs/job.model.js');
  const { default: Quote } = await import('../modules/jobs/quote.model.js');
  ({ rankByTrust } = await import('../modules/trust/trustPropagation.js'));
  const { createSessionToken } = await import('../modules/auth/session.js');
  const { default: app } = await import('../app.js');

  await mongoose.connect(MONGO);
  await mongoose.connection.dropDatabase();
  const tiler = (name, phone, extra) => ({ name, phone, role: 'worker', area: 'remera', skills: ['tiler'], ...extra });
  const client = (name, phone, extra) => ({ name, phone, role: 'client', area: 'remera', ...extra });
  const created = await User.create([
    client('Viewer Reason', '0788600001'),
    client('Amina Uwase', '0788600002'),                      // the viewer rated her; she hires tilers
    tiler('Bosco Worker', '0788600003', { skills: ['plumber'] }), // the viewer hired him; he rates a client
    client('Claire Hidden', '0788600004'),                    // two hops out: anonymous
    client('Grace Invitee', '0788600005'),                    // the viewer invited her
    client('Olive Rater', '0788600006', { area: 'gikondo' }),
    client('Paul Rater', '0788600007', { area: 'gikondo' }),
    client('Quinn Rater', '0788600008', { area: 'kimironko' }),
    tiler('Diane Direct', '0788600011'),
    tiler('Eric Twohop', '0788600012'),
    tiler('Felix Vouched', '0788600013'),
    tiler('Gilbert Threehop', '0788600014'),
    tiler('Henri Viainvite', '0788600015'),
    tiler('Irene Invited', '0788600016'),
    tiler('Jean Unseen', '0788600017'),
    tiler('Kevin Area', '0788600018', { area: 'gikondo' }),
    tiler('Lucie Verified', '0788600019', { verifiedStatus: 'verified', createdAt: april }),
    tiler('Moses Plain', '0788600020', { createdAt: march }),
    tiler('Nadia Badly', '0788600021')
  ]);
  people = Object.fromEntries(created.map(u => [u.name.split(' ')[0], u]));
  const id = name => people[name]._id;
  const rating = (from, to, stars, { referredFlag = false, at = march } = {}) =>
    ({ fromUser: id(from), toUser: id(to), type: 'rating', weight: stars / 5, referredFlag, createdAt: at });
  await TrustEdge.create([
    rating('Viewer', 'Diane', 4),
    rating('Viewer', 'Amina', 5),
    rating('Amina', 'Eric', 4),
    rating('Amina', 'Felix', 4, { referredFlag: true }),
    rating('Viewer', 'Bosco', 5),
    rating('Bosco', 'Claire', 5),
    rating('Claire', 'Gilbert', 5),
    { fromUser: id('Viewer'), toUser: id('Grace'), type: 'signup_referral', weight: 1, createdAt: march },
    rating('Grace', 'Henri', 4),
    { fromUser: id('Viewer'), toUser: id('Irene'), type: 'signup_referral', weight: 1, createdAt: april },
    rating('Amina', 'Jean', 5),
    // Kevin: two raters in his own area (Olive twice, 4 and 3 stars; Paul 5), one elsewhere.
    rating('Olive', 'Kevin', 4),
    rating('Olive', 'Kevin', 3),
    rating('Paul', 'Kevin', 5),
    rating('Quinn', 'Kevin', 5),
    rating('Viewer', 'Nadia', 1)
  ]);

  // The ratings the profile shows: Amina's of Eric and Felix, and Grace's of
  // Henri, are among each one's 5 most recent; Amina's of Jean was pushed off
  // by 5 newer ones.
  const jobId = () => new mongoose.Types.ObjectId();
  await Rating.create([
    { job: jobId(), fromUser: id('Amina'), toUser: id('Eric'), score: 4, createdAt: march },
    { job: jobId(), fromUser: id('Amina'), toUser: id('Felix'), score: 4, referredFlag: true, createdAt: march },
    { job: jobId(), fromUser: id('Grace'), toUser: id('Henri'), score: 4, createdAt: march },
    { job: jobId(), fromUser: id('Amina'), toUser: id('Jean'), score: 5, createdAt: march },
    ...['Quinn', 'Grace', 'Claire', 'Bosco', 'Viewer'].map(from =>
      ({ job: jobId(), fromUser: id(from), toUser: id('Jean'), score: 3, createdAt: april }))
  ]);

  const token = createSessionToken(await User.findById(id('Viewer')).select('+sessionVersion'));
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  const get = async path => {
    const res = await fetch(`${base}${path}`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(res.status, 200);
    return res.json();
  };

  workers = await get('/api/discover?category=tiler');

  const open = await Job.create({ client: id('Viewer'), category: 'tiler', area: 'remera', description: 'Retile the bathroom', proposedPrice: 20000 });
  await Quote.create([
    { job: open._id, worker: id('Moses'), amount: 18000, isCounter: true },
    { job: open._id, worker: id('Eric'), amount: 20000, isCounter: false },
    { job: open._id, worker: id('Kevin'), amount: 25000, isCounter: true },
    { job: open._id, worker: id('Diane'), amount: 22000, isCounter: true }
  ]);
  job = await get(`/api/jobs/${open._id}`);
});

after(async () => {
  if (skip) return;
  server.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const reasonOf = first => workers.find(w => w.name.startsWith(`${first} `)).reason;

test('1 hop: the viewer hired and rated the worker, with the stars and month', { skip }, () => {
  assert.deepEqual(reasonOf('Diane'), {
    tier: 'network', name: 'Diane', via: null, hops: [{ type: 'rating', stars: 4, hired: true, month: '2026-03' }]
  });
});

test('1 hop: the viewer invited the worker', { skip }, () => {
  assert.deepEqual(reasonOf('Irene'), { tier: 'network', name: 'Irene', via: null, hops: [{ type: 'invite', month: '2026-04' }] });
});

test('2 hops: the hop-1 person by first name, without and with a vouch', { skip }, () => {
  const first = { type: 'rating', stars: 5, hired: true, month: '2026-03' };
  assert.deepEqual(reasonOf('Eric'), {
    tier: 'network', name: 'Eric', via: 'Amina', hops: [first, { type: 'rating', stars: 4, hired: true, month: '2026-03' }]
  });
  assert.deepEqual(reasonOf('Felix'), {
    tier: 'network', name: 'Felix', via: 'Amina', hops: [first, { type: 'vouch', stars: 4, hired: true, month: '2026-03' }]
  });
});

test('2 hops through a signup invite', { skip }, () => {
  assert.deepEqual(reasonOf('Henri'), {
    tier: 'network', name: 'Henri', via: 'Grace',
    hops: [{ type: 'invite', month: '2026-03' }, { type: 'rating', stars: 4, hired: true, month: '2026-03' }]
  });
});

test('2 hops: a hop-1 rating no longer on the worker\'s profile stays anonymous', { skip }, () => {
  assert.equal(reasonOf('Jean').via, null);
  assert.equal(reasonOf('Jean').hops.length, 2);
});

test('3 hops: the middle person has no name and no id', { skip }, () => {
  assert.deepEqual(reasonOf('Gilbert'), {
    tier: 'network', name: 'Gilbert', via: 'Bosco',
    hops: [
      { type: 'rating', stars: 5, hired: true, month: '2026-03' },
      { type: 'rating', stars: 5, hired: false, month: '2026-03' }, // Bosco, a worker, rated the client who hired him
      { type: 'rating', stars: 5, hired: true, month: '2026-03' }
    ]
  });
});

test('area: distinct people in the worker\'s area who gave 3-5 stars, and the lowest of those', { skip }, () => {
  assert.deepEqual(reasonOf('Kevin'), { tier: 'area', name: 'Kevin', area: 'gikondo', people: 2, minStars: 3 });
});

test('new: verified or not, rated at all, and the join month', { skip }, () => {
  assert.deepEqual(reasonOf('Lucie'), { tier: 'new', name: 'Lucie', verified: true, rated: false, joined: '2026-04' });
  assert.deepEqual(reasonOf('Moses'), { tier: 'new', name: 'Moses', verified: false, rated: false, joined: '2026-03' });
  assert.equal(reasonOf('Nadia').rated, true);
});

test('offers on the client\'s own job: trust order with the same reasons', { skip }, async () => {
  const plain = await rankByTrust(people.Viewer._id, await mongoose.model('User').find({ _id: { $in: job.responses.map(r => r.worker._id) } }).lean());
  assert.deepEqual(job.responses.map(r => r.worker.name), plain.map(w => w.name));
  assert.deepEqual(job.responses.map(r => r.worker.name.split(' ')[0]), ['Diane', 'Eric', 'Kevin', 'Moses']);
  for (const r of job.responses) {
    assert.deepEqual(r.reason, workers.find(w => w.name === r.worker.name).reason);
    assert.deepEqual(Object.keys(r.worker).sort(), ['_id', 'area', 'name', 'skills', 'verifiedStatus']);
  }
});

test('nothing leaks from either response: no score, weight, phone, or id or full name of anyone on a path', { skip }, () => {
  for (const [label, text] of [['discover', JSON.stringify(workers)], ['offers', JSON.stringify(job.responses)]]) {
    for (const word of ['score', 'Score', 'weight', 'positive', 'negative', 'trustReason', 'phone', '07886000', '+2507886000',
      'Uwase', 'Claire', 'Hidden', 'Invitee', 'Rater', 'Olive', 'Paul', 'Quinn']) {
      assert.equal(text.includes(word), false, `${label}: ${word}`);
    }
    for (const name of ['Viewer', 'Amina', 'Bosco', 'Claire', 'Grace', 'Olive', 'Paul', 'Quinn']) {
      assert.equal(text.includes(String(people[name]._id)), false, `${label}: id of ${name}`);
    }
  }
  assert.equal(JSON.stringify(job).includes('phone'), false);
  for (const w of workers) {
    assert.deepEqual(Object.keys(w).sort(), ['_id', 'area', 'name', 'reason', 'skills', 'trustSource', 'verified']);
  }
});

test('order and tiers are exactly what rankByTrust gives without explanations', { skip }, async () => {
  const candidates = await mongoose.model('User').find({ role: 'worker', skills: 'tiler' }).lean();
  const plain = await rankByTrust(people.Viewer._id, candidates);
  assert.deepEqual(workers.map(w => [w.name, w.trustSource]), plain.map(w => [w.name, w.trustSource]));
  assert.deepEqual(workers.map(w => w.reason.tier), plain.map(w => ({ network: 'network', area: 'area', fallback: 'new' })[w.trustSource]));
});
