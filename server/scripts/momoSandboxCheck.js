// Checks the momo-sandbox provider against the real MTN MoMo SANDBOX, without
// the app or a database: one requestToPay (Collections) and one transfer
// (Disbursements) of a small amount to the sandbox test number, each polled
// until it settles, then the first one sent again with the same reference to
// show it is not charged twice. Needs the six MOMO_* keys (see
// momoSandboxSetup.js). Sandbox only: no real money moves.
//
//   node --env-file=.env scripts/momoSandboxCheck.js
import { randomUUID } from 'node:crypto';
import { createMomoSandboxProvider } from '../modules/payments/providers/momoSandbox.js';

const momo = createMomoSandboxProvider(process.env);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function check(label, api, call) {
  const referenceId = randomUUID();
  const request = { referenceId, amount: 100, currency: momo.currency, externalId: `check-${Date.now()}`, party: { role: 'check' }, note: 'Middleman sandbox check' };
  try {
    console.log(`${label}: ${JSON.stringify(await call(request))}`);
  } catch (err) {
    console.log(`${label}: FAILED to send: ${err.message}`);
    return null;
  }
  for (let i = 0; i < 20; i++) {
    const status = await momo.getStatus(api, referenceId);
    console.log(`  status: ${status.status}${status.reason ? ` (${status.reason})` : ''}`);
    if (status.status !== 'PENDING' && status.status !== 'NOT_FOUND') return request;
    await wait(3000);
  }
  console.log('  still pending after 60s');
  return request;
}

const pay = await check('requestToPay', 'collection', r => momo.requestToPay(r));
await check('transfer', 'disbursement', r => momo.transfer(r));
if (pay) console.log(`requestToPay again, same reference (expect duplicate: true): ${JSON.stringify(await momo.requestToPay(pay).catch(err => err.message))}`);
