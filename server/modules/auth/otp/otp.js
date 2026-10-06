import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import Otp from './otp.model.js';
import { getOtpProvider } from './providers.js';

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
const CODE_LENGTH = 6;

// HMAC key for code hashes. Set OTP_SECRET in production; without it a random
// per-process key is used, which is fine for development (codes don't survive
// a restart).
const SECRET = process.env.OTP_SECRET || randomBytes(32).toString('hex');

const hashCode = (phone, purpose, code) =>
  createHmac('sha256', SECRET).update(`${purpose}:${phone}:${code}`).digest('hex');

export class OtpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// "0788123456" -> "+250788123456" for SMS providers.
export const toE164 = localPhone => `+250${localPhone.slice(1)}`;

/** Creates (or replaces) the pending code for this phone and purpose, and sends it. */
export async function issueOtp(phone, purpose) {
  const code = String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
  await Otp.findOneAndUpdate(
    { phone, purpose },
    { codeHash: hashCode(phone, purpose, code), attempts: 0, expiresAt: new Date(Date.now() + OTP_TTL_MS) },
    { upsert: true }
  );
  await getOtpProvider().sendOtp(toE164(phone), code);
}

/**
 * Checks a code. Each wrong guess uses one of 5 attempts; after that, or after
 * 5 minutes, a new code is needed. A correct code is consumed.
 */
export async function verifyOtp(phone, purpose, code) {
  const otp = await Otp.findOne({ phone, purpose });
  if (!otp || otp.expiresAt < new Date()) throw new OtpError(400, 'That code has expired. Ask for a new one.');
  if (otp.attempts >= OTP_MAX_ATTEMPTS) throw new OtpError(429, 'Too many wrong codes. Ask for a new one.');

  const expected = Buffer.from(otp.codeHash, 'hex');
  const actual = Buffer.from(hashCode(phone, purpose, String(code ?? '').trim()), 'hex');
  if (!timingSafeEqual(expected, actual)) {
    otp.attempts += 1;
    await otp.save();
    const left = OTP_MAX_ATTEMPTS - otp.attempts;
    throw new OtpError(400, left > 0 ? `That code is wrong. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong codes. Ask for a new one.');
  }
  await otp.deleteOne();
}
