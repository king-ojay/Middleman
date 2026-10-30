// MTN MoMo Open API, SANDBOX only (sandbox.momodeveloper.mtn.com).
// Collections requestToPay funds escrow; Disbursements transfer releases it to
// the worker or refunds the client. Credentials come from env vars only:
//   MOMO_COLLECTION_SUBSCRIPTION_KEY, MOMO_COLLECTION_USER_ID, MOMO_COLLECTION_API_KEY
//   MOMO_DISBURSEMENT_SUBSCRIPTION_KEY, MOMO_DISBURSEMENT_USER_ID, MOMO_DISBURSEMENT_API_KEY
// Optional: MOMO_CURRENCY (EUR, the sandbox currency), MOMO_SANDBOX_MSISDN
// (the sandbox test number used as payer/payee), MOMO_CALLBACK_URL.
// scripts/momoSandboxSetup.js creates the user ids and API keys.
//
// No real money, ever: this refuses any host but the sandbox and any target
// environment but "sandbox". Participants' phone numbers are never sent:
// every payer and payee is the sandbox test number.
import { ProviderError } from './errors.js';

export const SANDBOX_HOST = 'sandbox.momodeveloper.mtn.com';
const TIMEOUT_MS = 15000;
const PATHS = { collection: 'requesttopay', disbursement: 'transfer' };

export function createMomoSandboxProvider(env = process.env, fetchImpl = globalThis.fetch) {
  const base = (env.MOMO_BASE_URL || `https://${SANDBOX_HOST}`).replace(/\/+$/, '');
  if (new URL(base).host !== SANDBOX_HOST) throw new Error(`momo-sandbox only talks to ${SANDBOX_HOST} (no real money)`);
  const targetEnvironment = env.MOMO_TARGET_ENVIRONMENT || 'sandbox';
  if (targetEnvironment !== 'sandbox') throw new Error('momo-sandbox only uses the "sandbox" target environment (no real money)');

  const product = name => {
    const prefix = `MOMO_${name.toUpperCase()}_`;
    const config = {
      subscriptionKey: env[`${prefix}SUBSCRIPTION_KEY`],
      userId: env[`${prefix}USER_ID`],
      apiKey: env[`${prefix}API_KEY`]
    };
    const missing = Object.entries(config).filter(([, v]) => !v).map(([k]) => prefix + k.replace(/[A-Z]/g, c => `_${c}`).toUpperCase());
    if (missing.length) throw new Error(`momo-sandbox needs ${missing.join(', ')}`);
    return { ...config, token: null, expiresAt: 0 };
  };
  const products = { collection: product('collection'), disbursement: product('disbursement') };
  const currency = env.MOMO_CURRENCY || 'EUR';
  const msisdn = env.MOMO_SANDBOX_MSISDN || '46733123450';
  const callbackUrl = env.MOMO_CALLBACK_URL || '';

  const send = async (url, init) => {
    try {
      return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      // No answer: it may or may not have arrived.
      throw new ProviderError(`MoMo sandbox unreachable: ${err.message}`, { definite: false });
    }
  };

  const failure = async (res, what) => {
    const text = await res.text().catch(() => '');
    // 4xx: refused, nothing happened. 5xx: unknown, check the status later.
    return new ProviderError(`MoMo sandbox ${what} failed (${res.status}) ${text.slice(0, 200)}`, { definite: res.status < 500, status: res.status });
  };

  // Access tokens last an hour; refresh a minute early.
  const token = async api => {
    const p = products[api];
    if (p.token && Date.now() < p.expiresAt) return p.token;
    const res = await send(`${base}/${api}/token/`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${p.userId}:${p.apiKey}`).toString('base64')}`,
        'Ocp-Apim-Subscription-Key': p.subscriptionKey
      }
    });
    if (!res.ok) throw await failure(res, 'token');
    const body = await res.json();
    p.token = body.access_token;
    p.expiresAt = Date.now() + (Number(body.expires_in || 3600) - 60) * 1000;
    return p.token;
  };

  const headers = async api => ({
    Authorization: `Bearer ${await token(api)}`,
    'X-Target-Environment': targetEnvironment,
    'Ocp-Apim-Subscription-Key': products[api].subscriptionKey
  });

  const post = async (api, { referenceId, amount, externalId, note }) => {
    const party = { partyIdType: 'MSISDN', partyId: msisdn };
    const body = {
      amount: String(amount),
      currency,
      externalId,
      ...(api === 'collection' ? { payer: party } : { payee: party }),
      payerMessage: note,
      payeeNote: note
    };
    const res = await send(`${base}/${api}/v1_0/${PATHS[api]}`, {
      method: 'POST',
      headers: {
        ...(await headers(api)),
        'Content-Type': 'application/json',
        'X-Reference-Id': referenceId,
        ...(callbackUrl ? { 'X-Callback-Url': `${callbackUrl}?ref=${encodeURIComponent(referenceId)}` } : {})
      },
      body: JSON.stringify(body)
    });
    if (res.status === 202) return { accepted: true, duplicate: false };
    // 409: this X-Reference-Id was already accepted; nothing new moves.
    if (res.status === 409) return { accepted: true, duplicate: true };
    throw await failure(res, PATHS[api]);
  };

  return {
    name: 'momo-sandbox',
    currency,
    requestToPay: request => post('collection', request),
    transfer: request => post('disbursement', request),
    async getStatus(api, referenceId) {
      const res = await send(`${base}/${api}/v1_0/${PATHS[api]}/${encodeURIComponent(referenceId)}`, { headers: await headers(api) });
      if (res.status === 404) return { status: 'NOT_FOUND', reason: '' };
      if (!res.ok) throw await failure(res, `${PATHS[api]} status`);
      const body = await res.json();
      const status = body.status === 'SUCCESSFUL' || body.status === 'PENDING' ? body.status : 'FAILED';
      const reason = typeof body.reason === 'string' ? body.reason : body.reason?.message || body.reason?.code || '';
      return { status, reason };
    }
  };
}
