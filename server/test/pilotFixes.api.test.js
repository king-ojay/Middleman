// Pilot fixes, through the API:
//   consent at sign-up (auth.routes.js): refused without both boxes or for an
//     older policy version, and stored (version, time, age) when given;
//   the 24-hour auto-release reminder (payments/releaseReminder.js): one SMS
//     to the client, once, and none once the job is released or disputed;
//   the admin code relay (auth/otp/codeRelay.js): sign-up codes only, behind
//     ADMIN_SECRET, masked numbers, each view logged; a rejected SMS still
//     lets sign-up go on to the code box.
// The SMS provider is replaced (setSmsProvider) to see what would be sent.
// The clock is moved with clock.js setNow. Needs TEST_MONGO_URI.
import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AUTO_RELEASE_AFTER_MS, RELEASE_REMINDER_BEFORE_MS } from '../config/autoRelease.js';
import { POLICY_VERSION } from '../config/policy.shared.js';
import { setNow } from '../modules/clock.js';

const MONGO = process.env.TEST_MONGO_URI && (() => {
  const url = new URL(process.env.TEST_MONGO_URI);
  url.pathname += '_pilotfixes';
  return url.toString();
})();
const skip = !MONGO && 'set TEST_MONGO_URI to run API tests';
const ADMIN_SECRET = 'pilot-fixes-admin-secret';
const HOUR = 60 * 60 * 1000;
const CONSENT = { ageConfirmed: true, policyAccepted: true, policyVersion: '1.0' };

let server, base, mongoose, User, Job, users, tokens, sms, releaseDueJobs, setSmsProvider, SmsRejectedError, clearSignupCodes;

// Records every SMS instead of sending it; `reject` makes the next send fail
// the way Africa's Talking does for a refused number.
const recorder = () => {
  const sent = [];
  let reject = false;
  return {
    sent,
    rejectNext() { reject = true; },
    async sendSms(phone, text) {
      if (reject) { reject = false; throw new SmsRejectedError('status="Rejected"'); }
      sent.push({ phone, text });
    },
    async sendOtp(phone, code) { return this.sendSms(phone, `code ${code}`); }
  };
};

before(async () => {
  if (skip) return;
  if (!/test/i.test(MONGO)) throw new Error('TEST_MONGO_URI must point at a database with "test" in its name');
  process.env.SESSION_SECRET = 'api-test-secret';
  process.env.ADMIN_SECRET = ADMIN_SECRET;

  mongoose = (await import('mongoose')).default;
  ({ default: User } = await import('../modules/users/user.model.js'));
  ({ default: Job } = await import('../modules/jobs/job.model.js'));
  const { default: Transaction } = await import('../modules/payments/transaction.model.js');
  const { createFakeProvider } = await import('../modules/payments/providers/fake.js');
  const { setPaymentProvider } = await import('../modules/payments/providers/index.js');
  ({ releaseDueJobs } = await import('../modules/payments/autoRelease.js'));
  ({ setSmsProvider, SmsRejectedError } = await import('../modules/auth/otp/providers.js'));
  ({ clearSignupCodes } = await import('../modules/auth/otp/codeRelay.js'));
  const { createSessionToken } = await import('../modules/auth/session.js');
  const { default: app } = await import('../app.js');

  await mongoose.connect(MONGO);
  await mongoose.connection.dropDatabase();
  await Promise.all([User, Job, Transaction].map(M => M.createIndexes()));
  const created = await User.create([
    { name: 'Clara Mukamana', phone: '0788670001', role: 'client', area: 'remera' },
    { name: 'Walter Niyonzima', phone: '0788670002', role: 'worker', area: 'remera', skills: ['plumber'] }
  ]);
  users = { client: created[0], worker: created[1] };
  tokens = {};
  for (const [key, u] of Object.entries(users)) tokens[key] = createSessionToken(await User.findById(u._id).select('+sessionVersion'));
  setPaymentProvider(createFakeProvider());
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (skip) return;
  setSmsProvider(null);
  server.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

beforeEach(async () => {
  if (skip) return;
  sms = recorder();
  setSmsProvider(sms);
  clearSignupCodes();
  await Job.deleteMany({});
});
afterEach(() => setNow());

async function call(method, path, { as, body, admin } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(as ? { authorization: `Bearer ${tokens[as]}` } : {}),
      ...(admin ? { 'x-admin-secret': admin } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const post = (path, as, body) => call('POST', path, { as, body });

// Asks for a sign-up code and returns it (as the SMS would carry it).
async function codeFor(phone) {
  assert.equal((await post('/api/auth/otp', null, { phone, purpose: 'register' })).status, 200);
  return sms.sent.at(-1).text.replace('code ', '');
}
const signup = (phone, otpCode, consent) => post('/api/auth/register', null, {
  role: 'client', name: 'Nadia Uwase', phone, area: 'remera', pin: '2468', otpCode, ...consent
});

test('the shared policy version is the one the app shows', () => {
  assert.equal(POLICY_VERSION, '1.0');
  const shared = readFileSync(new URL('../../shared/policy.js', import.meta.url), 'utf8');
  for (const copy of ['../config/policy.shared.js', '../../client/src/policy.shared.js']) {
    assert.ok(readFileSync(new URL(copy, import.meta.url), 'utf8').endsWith(shared), `${copy} is out of date: npm run sync:shared`);
  }
});

test('sign-up is refused without both consents or for an older policy, and creates nobody', { skip }, async () => {
  const phone = '0788670101';
  const otp = await codeFor(phone);
  const refusals = [
    [{}, 'age_required'],
    [{ ...CONSENT, ageConfirmed: false }, 'age_required'],
    [{ ...CONSENT, ageConfirmed: 'yes' }, 'age_required'],
    [{ ...CONSENT, policyAccepted: false }, 'policy_required'],
    [{ ageConfirmed: true, policyVersion: '1.0' }, 'policy_required'],
    [{ ...CONSENT, policyVersion: '0.9' }, 'policy_required']
  ];
  for (const [consent, code] of refusals) {
    const res = await signup(phone, otp, consent);
    assert.equal(res.status, 400, JSON.stringify(consent));
    assert.equal(res.data.code, code, JSON.stringify(consent));
  }
  assert.equal(await User.exists({ phone }), null);
  // The code wasn't used up by the refusals.
  assert.equal((await signup(phone, otp, CONSENT)).status, 201);
});

test('sign-up with consent stores the policy version, when, and the age confirmation', { skip }, async () => {
  const phone = '0788670102';
  const before = Date.now();
  const res = await signup(phone, await codeFor(phone), CONSENT);
  assert.equal(res.status, 201);
  const user = await User.findOne({ phone }).lean();
  assert.equal(user.policyVersion, '1.0');
  assert.equal(user.ageConfirmed, true);
  assert.ok(user.consentedAt.getTime() >= before && user.consentedAt.getTime() <= Date.now());
  // Nobody else sees it: another person's profile carries none of it.
  const profile = await call('GET', `/api/users/${user._id}/profile`, { as: 'client' });
  assert.equal(profile.status, 200);
  for (const field of ['policyVersion', 'consentedAt', 'ageConfirmed']) assert.equal(field in profile.data, false, field);
});

// A job paid into escrow, started and marked done, through the API.
async function awaitingJob(description = 'Fix the kitchen tap') {
  const job = await Job.create({
    client: users.client._id, worker: users.worker._id, category: 'plumber', area: 'remera', description,
    proposedPrice: 15000, agreedPrice: 15000, status: 'quote_accepted', acceptedAt: new Date()
  });
  assert.equal((await post(`/api/jobs/${job._id}/fund`, 'client')).status, 200);
  assert.equal((await post(`/api/jobs/${job._id}/start`, 'worker')).status, 200);
  assert.equal((await post(`/api/jobs/${job._id}/complete`, 'worker')).status, 200);
  return Job.findById(job._id).lean();
}
const at = (job, ms) => setNow(() => new Date(job.workerCompletedAt.getTime() + ms));
const reminders = () => sms.sent.filter(s => s.text.startsWith('Middleman: payment for'));

test('24 hours before the automatic release the client gets one SMS, once, even from two sweeps at once', { skip }, async () => {
  const job = await awaitingJob();
  at(job, AUTO_RELEASE_AFTER_MS - RELEASE_REMINDER_BEFORE_MS - HOUR);
  assert.equal((await releaseDueJobs()).reminded, 0, 'not yet: 25 hours to go');
  assert.equal(reminders().length, 0);

  at(job, AUTO_RELEASE_AFTER_MS - RELEASE_REMINDER_BEFORE_MS + HOUR);
  const [a, b] = await Promise.all([releaseDueJobs(), releaseDueJobs()]);
  assert.equal(a.reminded + b.reminded, 1);
  assert.equal(reminders().length, 1);
  const [{ phone, text }] = reminders();
  assert.equal(phone, '+250788670001');
  assert.match(text, /^Middleman: payment for "Fix the kitchen tap" will be released to Walter Niyonzima on \d{1,2} \w{3} \d{4}, \d\d:\d\d\. If there is a problem, open the app and report it before then\.$/);
  assert.ok((await Job.findById(job._id).lean()).releaseReminderAt);

  // Later sweeps send nothing more; the job page still shows the date.
  at(job, AUTO_RELEASE_AFTER_MS - HOUR);
  assert.equal((await releaseDueJobs()).reminded, 0);
  assert.equal(reminders().length, 1);
  const page = await call('GET', `/api/jobs/${job._id}`, { as: 'client' });
  assert.equal(page.data.autoReleaseAt, new Date(job.workerCompletedAt.getTime() + AUTO_RELEASE_AFTER_MS).toISOString());
});

test('no reminder for a job already disputed, confirmed or released', { skip }, async () => {
  const disputed = await awaitingJob('Disputed job');
  assert.equal((await post(`/api/jobs/${disputed._id}/dispute`, 'client', { reason: 'not_done', details: 'The tap still leaks after the repair.' })).status, 200);
  const confirmed = await awaitingJob('Confirmed job');
  assert.equal((await post(`/api/jobs/${confirmed._id}/confirm`, 'client', { score: 5 })).status, 200);
  const released = await awaitingJob('Released job');
  at(released, AUTO_RELEASE_AFTER_MS + HOUR); // past the deadline: released in this sweep
  const r = await releaseDueJobs();
  assert.equal(r.released, 1);
  assert.equal(r.reminded, 0);
  at(disputed, AUTO_RELEASE_AFTER_MS - HOUR);
  assert.equal((await releaseDueJobs()).reminded, 0);
  assert.equal(reminders().length, 0);
});

test('the sign-up code relay needs the admin secret', { skip }, async () => {
  await codeFor('0794016563');
  assert.equal((await call('GET', '/api/admin/signup-codes')).status, 401);
  assert.equal((await call('GET', '/api/admin/signup-codes', { admin: 'wrong-secret' })).status, 401);
  assert.equal((await call('GET', '/api/admin/signup-codes', { as: 'client' })).status, 401);
});

test('the relay shows sign-up codes from the last 15 minutes with masked numbers, never PIN-reset codes, and logs each view', { skip }, async () => {
  const code = await codeFor('0794016563');
  await post('/api/auth/otp', null, { phone: '0788670001', purpose: 'pin_reset' }); // an existing account
  const lines = [];
  const log = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  let res;
  try {
    res = await call('GET', '/api/admin/signup-codes', { admin: ADMIN_SECRET });
  } finally {
    console.log = log;
  }
  assert.equal(res.status, 200);
  assert.equal(res.data.codes.length, 1);
  assert.equal(res.data.codes[0].phone, '079*****563');
  assert.equal(res.data.codes[0].code, code);
  assert.equal(res.data.codes[0].expired, false);
  assert.equal(JSON.stringify(res.data).includes('0794016563'), false);
  assert.match(lines.join('\n'), /\[admin\] .* sign-up codes viewed \(1 shown\)/);
  assert.equal(lines.join('\n').includes(code), false, 'the log never carries a code');

  // Expired after 5 minutes (shown as expired), gone after 15.
  const issued = new Date();
  setNow(() => new Date(issued.getTime() + 6 * 60 * 1000));
  assert.equal((await call('GET', '/api/admin/signup-codes', { admin: ADMIN_SECRET })).data.codes[0].expired, true);
  setNow(() => new Date(issued.getTime() + 16 * 60 * 1000));
  assert.deepEqual((await call('GET', '/api/admin/signup-codes', { admin: ADMIN_SECRET })).data.codes, []);
});

test('a rejected sign-up SMS still goes on to the code box, and the relayed code works', { skip }, async () => {
  const phone = '0794016564';
  sms.rejectNext();
  const otp = await post('/api/auth/otp', null, { phone, purpose: 'register' });
  assert.equal(otp.status, 200);
  assert.deepEqual(otp.data, { sent: false, relay: true });
  const [{ code }] = (await call('GET', '/api/admin/signup-codes', { admin: ADMIN_SECRET })).data.codes;
  assert.equal((await signup(phone, code, CONSENT)).status, 201);

  // A rejected PIN-reset SMS is still an error: those codes are never relayed.
  sms.rejectNext();
  const reset = await post('/api/auth/otp', null, { phone, purpose: 'pin_reset' });
  assert.equal(reset.status, 502);
  assert.equal(reset.data.code, 'code_rejected');
});
