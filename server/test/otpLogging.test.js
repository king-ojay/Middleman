// Logs never carry a full phone number, and the console provider prints the
// code itself only outside production.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getOtpProvider, maskPhone, maskPhonesIn, SmsRejectedError } from '../modules/auth/otp/providers.js';
import { stubAfricasTalking, atAnswer } from './africasTalkingStub.js';

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; });

const logged = async fn => {
  const lines = [];
  const original = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  try { await fn(); } finally { console.log = original; }
  return lines.join('\n');
};

test('maskPhone keeps the country code and the last 3 digits only', () => {
  assert.equal(maskPhone('+250788123456'), '+250*****456');
  assert.equal(maskPhone('0788123456'), '*****456');
});

test('maskPhonesIn masks every Rwandan number in free text', () => {
  assert.equal(
    maskPhonesIn("The 'To' number +250788123456 is not valid; also 0791234567 and 250722000111"),
    "The 'To' number +250*****456 is not valid; also *****567 and +250*****111"
  );
  assert.equal(maskPhonesIn('SMS provider returned 500'), 'SMS provider returned 500');
});

test('console provider outside production: masked number and the code', async () => {
  process.env.OTP_PROVIDER = 'console';
  process.env.NODE_ENV = 'development';
  const out = await logged(() => getOtpProvider().sendOtp('+250788123456', '654321'));
  assert.equal(out, '[otp] code for +250*****456 is 654321');
  assert.doesNotMatch(out, /788123/);
});

test('console provider in production: masked number, no code', async () => {
  process.env.OTP_PROVIDER = 'console';
  process.env.NODE_ENV = 'production';
  const out = await logged(() => getOtpProvider().sendOtp('+250788123456', '654321'));
  assert.match(out, /\+250\*{5}456/);
  assert.doesNotMatch(out, /654321|788123/);
});

// Africa's Talking, mocked: one log line per send with the time, the masked
// number and the recipient's status, and never the code, full number,
// username or API key.
const useAt = (senderId) => {
  process.env.OTP_PROVIDER = 'africastalking';
  process.env.AT_USERNAME = 'middleman-user';
  process.env.AT_API_KEY = 'atsk_test_key_123456';
  if (senderId === undefined) delete process.env.AT_SENDER_ID; else process.env.AT_SENDER_ID = senderId;
};
const PRIVATE = /654321|788123|middleman-user|atsk_test_key_123456/;
const LINE = /^\[sms\] \d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z africastalking to \+250\*{5}456 /;

test('Africa\'s Talking success: sent, one masked log line with status and statusCode', async () => {
  useAt();
  const at = stubAfricasTalking(() => atAnswer([{ number: '+250788123456', status: 'Success', statusCode: 101, cost: 'RWF 15' }]));
  try {
    const out = await logged(() => getOtpProvider().sendOtp('+250788123456', '654321'));
    assert.equal(out.split('\n').length, 1);
    assert.match(out, LINE);
    assert.match(out, /status="Success" statusCode=101$/);
    assert.doesNotMatch(out, PRIVATE);
    assert.equal(at.calls.length, 1);
    assert.equal(at.calls[0].fields.to, '+250788123456');
    assert.equal('from' in at.calls[0].fields, false);
  } finally { at.restore(); }
});

test('AT_SENDER_ID: unset or blank sends no from; set sends it', async () => {
  for (const [senderId, expected] of [[undefined, undefined], ['', undefined], ['   ', undefined], ['MIDDLEMAN', 'MIDDLEMAN']]) {
    useAt(senderId);
    const at = stubAfricasTalking(() => atAnswer([{ status: 'Success', statusCode: 101 }]));
    try {
      await logged(() => getOtpProvider().sendOtp('+250788123456', '654321'));
      assert.equal(at.calls[0].fields.from, expected, JSON.stringify(senderId));
    } finally { at.restore(); }
  }
});

test('Africa\'s Talking rejects the recipient: SmsRejectedError, and the reason is logged', async () => {
  useAt();
  const at = stubAfricasTalking(() => atAnswer([{ number: '+250788123456', status: 'InvalidPhoneNumber', statusCode: 403 }]));
  try {
    let error;
    const out = await logged(() => getOtpProvider().sendOtp('+250788123456', '654321').catch(e => { error = e; }));
    assert.ok(error instanceof SmsRejectedError);
    assert.match(out, LINE);
    assert.match(out, /status="InvalidPhoneNumber" statusCode=403$/);
    assert.doesNotMatch(out + error.message, PRIVATE);
  } finally { at.restore(); }
  // no recipient at all (e.g. a bad sender ID) is a rejection too
  const empty = stubAfricasTalking(() => atAnswer([]));
  try {
    let error;
    const out = await logged(() => getOtpProvider().sendOtp('+250788123456', '654321').catch(e => { error = e; }));
    assert.ok(error instanceof SmsRejectedError);
    assert.match(out, /no recipient/);
  } finally { empty.restore(); }
});

test('Africa\'s Talking throws (network or HTTP error): logged without secrets, and the error is passed on', async () => {
  useAt();
  for (const respond of [
    () => { throw new Error('connect ECONNREFUSED'); },
    () => new Response('The supplied authentication is invalid for middleman-user (atsk_test_key_123456) to +250788123456', { status: 401 })
  ]) {
    const at = stubAfricasTalking(respond);
    try {
      let error;
      const out = await logged(() => getOtpProvider().sendOtp('+250788123456', '654321').catch(e => { error = e; }));
      assert.ok(error instanceof Error && !(error instanceof SmsRejectedError));
      assert.match(out, LINE);
      assert.match(out, /error="/);
      assert.doesNotMatch(out + error.message, PRIVATE);
    } finally { at.restore(); }
  }
});
