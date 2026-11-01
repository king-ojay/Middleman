// Marks a participant verified after the researcher has checked them in
// person, or revokes it, through the admin route (modules/users/verification.js).
// Needs ADMIN_SECRET (the same value as on the API); nothing else is recorded
// than who (researcher), when and how (in-person). Prints ids and the
// verification fields only, no name or phone.
//
//   API_URL=https://middleman-api-74zb.onrender.com ADMIN_SECRET=... \
//     node scripts/verifyUser.js --phone 0788123456
//   node --env-file=.env scripts/verifyUser.js --id <userId> --revoke
//
// API_URL defaults to http://localhost:4000.
const args = process.argv.slice(2);
const value = flag => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const phone = value('--phone');
const userId = value('--id');
const revoke = args.includes('--revoke');
const api = (process.env.API_URL || 'http://localhost:4000').replace(/\/+$/, '');

if (!process.env.ADMIN_SECRET) {
  console.error('Set ADMIN_SECRET (the same value as on the API).');
  process.exit(1);
}
if (!phone === !userId) {
  console.error('Usage: node scripts/verifyUser.js (--phone 07XXXXXXXX | --id <userId>) [--revoke]');
  process.exit(1);
}

const res = await fetch(`${api}/api/admin/verification/${revoke ? 'revoke' : 'verify'}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-admin-secret': process.env.ADMIN_SECRET },
  body: JSON.stringify(phone ? { phone } : { userId })
});
const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`Failed (${res.status}): ${body.error || 'no answer'}`);
  process.exit(1);
}
console.log(`${revoke ? 'Revoked' : 'Verified'}: ${JSON.stringify(body)}`);
