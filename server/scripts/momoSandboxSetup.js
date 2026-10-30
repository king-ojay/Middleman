// One-time setup for the MTN MoMo SANDBOX: creates an API user and API key for
// Collections and for Disbursements, from the subscription keys on your
// momodeveloper.mtn.com profile. Prints the values to put in Render's
// environment settings (never in the repo).
//
//   MOMO_COLLECTION_SUBSCRIPTION_KEY=... MOMO_DISBURSEMENT_SUBSCRIPTION_KEY=... \
//   MOMO_CALLBACK_HOST=middleman-api-74zb.onrender.com node scripts/momoSandboxSetup.js
import { randomUUID } from 'node:crypto';
import { SANDBOX_HOST } from '../modules/payments/providers/momoSandbox.js';

const base = `https://${SANDBOX_HOST}`;
const callbackHost = process.env.MOMO_CALLBACK_HOST;
if (!callbackHost) {
  console.error('Set MOMO_CALLBACK_HOST to the API host (no https://), e.g. middleman-api-74zb.onrender.com');
  process.exit(1);
}

for (const product of ['collection', 'disbursement']) {
  const key = process.env[`MOMO_${product.toUpperCase()}_SUBSCRIPTION_KEY`];
  if (!key) {
    console.error(`Skipping ${product}: MOMO_${product.toUpperCase()}_SUBSCRIPTION_KEY is not set`);
    continue;
  }
  const userId = randomUUID();
  const created = await fetch(`${base}/v1_0/apiuser`, {
    method: 'POST',
    headers: { 'X-Reference-Id': userId, 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerCallbackHost: callbackHost })
  });
  if (created.status !== 201) {
    console.error(`${product}: creating the API user failed (${created.status}) ${await created.text()}`);
    continue;
  }
  const keyRes = await fetch(`${base}/v1_0/apiuser/${userId}/apikey`, { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': key } });
  if (keyRes.status !== 201) {
    console.error(`${product}: creating the API key failed (${keyRes.status}) ${await keyRes.text()}`);
    continue;
  }
  const { apiKey } = await keyRes.json();
  const prefix = `MOMO_${product.toUpperCase()}_`;
  console.log(`${prefix}USER_ID=${userId}`);
  console.log(`${prefix}API_KEY=${apiKey}`);
}
