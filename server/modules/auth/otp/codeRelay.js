// Pilot fallback for sign-up codes the SMS can't deliver (MTN Rwanda rejects
// the shared sender ID): the researcher reads the code on /admin and passes it
// on. Only sign-up codes, never PIN-reset codes (a relayed reset would hand
// someone else's account over). The codes live in this process's memory
// only, for RELAY_KEEP_MS, and are never written to the database, which keeps
// only the HMAC of each code (otp.js). A code still works only until its own
// 5-minute expiry. Phones are shown as 079*****563.
import { now } from '../../clock.js';

export const RELAY_KEEP_MS = 15 * 60 * 1000;
const kept = []; // { phone, code, issuedAt, expiresAt }, oldest first

const forget = () => {
  const cutoff = now().getTime() - RELAY_KEEP_MS;
  while (kept.length && kept[0].issuedAt.getTime() < cutoff) kept.shift();
};

/** Keeps a newly issued sign-up code (a new code for the same number replaces the old one). */
export function keepSignupCode(phone, code, expiresAt) {
  forget();
  const i = kept.findIndex(k => k.phone === phone);
  if (i >= 0) kept.splice(i, 1);
  kept.push({ phone, code, issuedAt: now(), expiresAt });
}

// "0794016563" -> "079*****563": enough to match a caller to their code.
export const maskForRelay = phone => `${phone.slice(0, 3)}*****${phone.slice(-3)}`;

/** The codes from the last 15 minutes, newest first, with masked numbers. */
export function signupCodes() {
  forget();
  const at = now().getTime();
  return kept.slice().reverse().map(k => ({
    phone: maskForRelay(k.phone),
    code: k.code,
    issuedAt: k.issuedAt,
    expiresAt: k.expiresAt,
    expired: k.expiresAt.getTime() <= at
  }));
}

/** For tests: forget every kept code. */
export const clearSignupCodes = () => { kept.length = 0; };
