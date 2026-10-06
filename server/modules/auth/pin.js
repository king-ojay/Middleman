import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 32;

export const isValidPin = pin => /^\d{4}$/.test(String(pin ?? ''));

// Stored as "salt:hash" (hex). A fresh random salt per user (NFR-04).
export async function hashPin(pin) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scryptAsync(String(pin), salt, KEY_LENGTH);
  return `${salt}:${hash.toString('hex')}`;
}

export async function verifyPin(pin, stored) {
  if (!stored || !isValidPin(pin)) return false;
  const [salt, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scryptAsync(String(pin), salt, expected.length);
  return timingSafeEqual(actual, expected);
}
