// Rwandan mobile numbers, stored as 07XXXXXXXX. Accepts spaces, dashes and
// a +250 / 250 prefix.
export function normalisePhone(input) {
  let digits = String(input ?? '').replace(/\D/g, '');
  if (digits.startsWith('250') && digits.length === 12) digits = `0${digits.slice(3)}`;
  return /^07\d{8}$/.test(digits) ? digits : null;
}
