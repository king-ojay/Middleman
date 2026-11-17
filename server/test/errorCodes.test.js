// Error codes for the app's translations (modules/errorCodes.js): known
// messages get a stable code (and their numbers as params), unknown ones get
// none, the middleware adds them to any JSON error body, and every code has
// an English translation in the app (client/src/i18n/en.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_CODES, addErrorCodes, errorCode } from '../modules/errorCodes.js';
import { SERVER_ERROR } from '../modules/serverError.js';
import { AT_LIMIT_MESSAGE, WORKER_BUSY_MESSAGE } from '../modules/jobs/workload.js';
import { LOOKUP_LIMITED, LOOKUP_NOT_FOUND } from '../modules/users/users.routes.js';
import en from '../../client/src/i18n/en.js';

test('known messages get their code, with any numbers as params', () => {
  assert.deepEqual(errorCode('Job not found'), { code: 'job_not_found' });
  assert.deepEqual(errorCode(SERVER_ERROR), { code: 'server_error' });
  assert.deepEqual(errorCode(LOOKUP_NOT_FOUND), { code: 'lookup_not_found' });
  assert.deepEqual(errorCode(LOOKUP_LIMITED), { code: 'lookup_limited' });
  assert.deepEqual(errorCode(AT_LIMIT_MESSAGE), { code: 'at_limit', params: { limit: 3 } });
  assert.deepEqual(errorCode(WORKER_BUSY_MESSAGE), { code: 'worker_busy', params: { limit: 3 } });
  assert.deepEqual(errorCode('That code is wrong. 1 try left.'), { code: 'code_wrong', params: { left: 1 } });
  assert.deepEqual(errorCode('That code is wrong. 4 tries left.'), { code: 'code_wrong', params: { left: 4 } });
  assert.deepEqual(errorCode('Describe what is wrong in at least 20 characters'), { code: 'dispute_details_short', params: { min: 20 } });
  assert.deepEqual(errorCode('Only workers can do this'), { code: 'workers_only' });
});

test('anything else gets no code (the app shows the English text)', () => {
  assert.equal(errorCode("Can't start a job that is open"), null);
  assert.equal(errorCode('Job not found, really'), null);
  assert.equal(errorCode(undefined), null);
});

test('the middleware adds the code to error bodies and leaves everything else alone', () => {
  const sent = [];
  const res = { json: body => sent.push(body) };
  addErrorCodes({}, res, () => {});
  res.json({ error: 'Person not found' });
  res.json({ error: 'Something new' });
  res.json({ error: 'Job not found', code: 'already_set' });
  res.json({ ok: true });
  assert.deepEqual(sent, [
    { error: 'Person not found', code: 'person_not_found' },
    { error: 'Something new' },
    { error: 'Job not found', code: 'already_set' },
    { ok: true }
  ]);
});

test('every code has an English translation in the app', () => {
  const missing = ERROR_CODES.filter(code => !(`error.${code}` in en) && !(`error.${code}.one` in en && `error.${code}.other` in en));
  assert.deepEqual(missing, []);
});
