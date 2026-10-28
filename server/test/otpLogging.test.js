// Logs never carry a full phone number, and the console provider prints the
// code itself only outside production.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getOtpProvider, maskPhone, maskPhonesIn } from '../modules/auth/otp/providers.js';

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
