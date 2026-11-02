// Unknown server errors: one generic message for the person, the real error in
// the server log without personal data. No database needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { serverError, SERVER_ERROR } from '../modules/serverError.js';

const fakeRes = () => {
  const res = { statusCode: 0, body: null };
  res.status = code => { res.statusCode = code; return res; };
  res.json = body => { res.body = body; return res; };
  return res;
};
const logged = fn => {
  const lines = [];
  const original = console.error;
  console.error = (...args) => lines.push(args.join(' '));
  try { fn(); } finally { console.error = original; }
  return lines.join('\n');
};
const req = { method: 'GET', originalUrl: '/api/users/search?q=Amina%20Uwase', query: { q: 'Amina Uwase' }, body: { phone: '0788123456' } };

test('answers 500 with the generic message, never the error text', () => {
  const res = fakeRes();
  logged(() => serverError(res, new Error('connection to 10.0.0.5 refused'), req));
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: SERVER_ERROR });
  assert.equal(SERVER_ERROR, 'Something went wrong. Please try again.');
});

test('logs the path and the real error, with phone numbers masked and no query or body', () => {
  const line = logged(() => serverError(fakeRes(), new Error('SMS to +250788123456 failed'), req));
  assert.match(line, /^\[error\] GET \/api\/users\/search Error: SMS to \+250\*{5}456 failed/);
  assert.match(line, /serverError\.test\.js/); // top of the stack
  for (const s of ['788123456', 'Amina', 'Uwase', '0788123456']) assert.equal(line.includes(s), false, s);
  const withId = logged(() => serverError(fakeRes(), new Error('x'), { method: 'POST', originalUrl: '/api/jobs/6ae71db40fba0d1ca2e97865/fund' }));
  assert.match(withId, /^\[error\] POST \/api\/jobs\/:id\/fund Error: x/);
});

test('database errors that echo submitted values are logged by field name only', () => {
  const validation = Object.assign(new Error('User validation failed: name: Path `name` (`Amina Uwase`) is longer than the maximum'), {
    name: 'ValidationError', errors: { name: {} }
  });
  const duplicate = Object.assign(new Error('E11000 duplicate key error dup key: { phone: "0788123456" }'), {
    name: 'MongoServerError', code: 11000, keyPattern: { phone: 1 }, keyValue: { phone: '0788123456' }
  });
  const cast = Object.assign(new Error('Cast to ObjectId failed for value "Amina Uwase"'), { name: 'CastError', path: '_id' });
  const line = logged(() => [validation, duplicate, cast].forEach(err => serverError(fakeRes(), err, req)));
  assert.match(line, /ValidationError: invalid name/);
  assert.match(line, /MongoServerError \(11000\): duplicate key on phone/);
  assert.match(line, /CastError: cast failed for _id/);
  for (const s of ['Amina', '788123456']) assert.equal(line.includes(s), false, s);
});

test('no route handler sends a raw error message with a 500', () => {
  const files = ['auth/auth.routes.js', 'jobs/jobs.routes.js', 'payments/payments.routes.js', 'trust/discover.routes.js', 'users/users.routes.js'];
  for (const f of files) {
    const src = readFileSync(new URL(`../modules/${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /status\(500\)\.json\(\{ error: err\.message/, f);
  }
});

test('form errors (the Login PIN error) are announced: FormField renders them with role="alert"', () => {
  const src = readFileSync(new URL('../../client/src/components/ui/FormField.jsx', import.meta.url), 'utf8');
  assert.match(src, /<p key="error" id=\{`\$\{id\}-hint`\} role="alert"/);
  const login = readFileSync(new URL('../../client/src/pages/Login.jsx', import.meta.url), 'utf8');
  assert.match(login, /<FormField label="PIN" error=\{error\}>/);
});
