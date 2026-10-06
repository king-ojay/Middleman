import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

process.env.SESSION_SECRET = 'unit-test-secret';
process.env.SESSION_TTL_HOURS = '12';
const { createSessionToken, verifySessionToken } = await import('../modules/auth/session.js');

const user = { _id: '6650aa00aa00aa00aa00aa01', sessionVersion: 3 };
const b64 = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');

test('a fresh token verifies and carries the user id and session version', () => {
  const payload = verifySessionToken(createSessionToken(user));
  assert.equal(payload.sub, user._id);
  assert.equal(payload.ver, 3);
  assert.equal(payload.exp - payload.iat, 12 * 3600);
});

test('a tampered payload is rejected', () => {
  const [h, , s] = createSessionToken(user).split('.');
  const forged = b64({ sub: '6650aa00aa00aa00aa00aa02', ver: 3, iat: 1, exp: 9999999999 });
  assert.equal(verifySessionToken(`${h}.${forged}.${s}`), null);
});

test('a token signed with another secret is rejected', () => {
  const [h, p] = createSessionToken(user).split('.');
  const sig = createHmac('sha256', 'attacker-secret').update(`${h}.${p}`).digest('base64url');
  assert.equal(verifySessionToken(`${h}.${p}.${sig}`), null);
});

test('alg "none" tokens are rejected', () => {
  const h = b64({ alg: 'none', typ: 'JWT' });
  const p = b64({ sub: user._id, ver: 3, iat: 1, exp: 9999999999 });
  assert.equal(verifySessionToken(`${h}.${p}.`), null);
});

test('an expired token is rejected', () => {
  const issued = Date.now() - 13 * 3600 * 1000;
  assert.equal(verifySessionToken(createSessionToken(user, issued)), null);
});

test('garbage is rejected without throwing', () => {
  for (const t of [undefined, null, '', 'abc', 'a.b.c', 'x'.repeat(5000), 42]) {
    assert.equal(verifySessionToken(t), null);
  }
});
