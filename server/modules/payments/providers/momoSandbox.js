// MTN MoMo Open API, SANDBOX only (sandbox.momodeveloper.mtn.com).
// Collections requestToPay funds escrow; Disbursements transfer releases it to
// the worker or refunds the client. Credentials come from env vars only:
//   MOMO_COLLECTION_SUBSCRIPTION_KEY, MOMO_COLLECTION_USER_ID, MOMO_COLLECTION_API_KEY
//   MOMO_DISBURSEMENT_SUBSCRIPTION_KEY, MOMO_DISBURSEMENT_USER_ID, MOMO_DISBURSEMENT_API_KEY
// Optional: MOMO_CURRENCY (EUR, the sandbox currency), MOMO_SANDBOX_MSISDN
// (the sandbox test number used as payer/payee, default 46733123480: a number
// outside MTN's test table, so payments succeed; 46733123450–3 give failed,
// rejected, expired and pending, see docs/RUNBOOK.md), MOMO_CALLBACK_URL.
// scripts/momoSandboxSetup.js creates the user ids and API keys.
//
// No real money, ever: this refuses any host but the sandbox and any target
// environment but "sandbox". Participants' phone numbers are never sent:
// every payer and payee is the sandbox test number. Nothing a person typed is
// sent either: payerMessage/payeeNote and externalId are letters, digits and
// spaces only (safeText.js).
import { ProviderError } from './errors.js';
import { safeExternalId, safeNote } from './safeText.js';
import { maskPhone } from '../../auth/otp/providers.js';

export const SANDBOX_HOST = 'sandbox.momodeveloper.mtn.com';
// Outside MTN's sandbox test-number table, so requests to it succeed.
export const DEFAULT_SANDBOX_MSISDN = '46733123480';
const TIMEOUT_MS = 15000;
const PATHS = { collection: 'requesttopay', disbursement: 'transfer' };
// Statuses that mean it is over and nothing moved. MTN reports most failures
// as FAILED with a reason (APPROVAL_REJECTED, EXPIRED, …), but the sandbox
// test numbers have been described with their own status names too.
// Anything else (PENDING, ONGOING, CREATED, unknown) is still pending: a
// payment into escrow that never finishes expires (escrow.js FUND_EXPIRY_MS).
const FINAL_FAILURES = ['FAILED', 'REJECTED', 'TIMEOUT', 'EXPIRED', 'CANCELLED'];

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
  const msisdn = env.MOMO_SANDBOX_MSISDN || DEFAULT_SANDBOX_MSISDN;
  const callbackUrl = env.MOMO_CALLBACK_URL || '';

  const send = async (url, init) => {
    try {
      return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      // No answer: it may or may not have arrived.
      throw new ProviderError(`MoMo sandbox unreachable: ${err.message}`, { definite: false });
    }
  };

  const contentType = res => (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  // MoMo answers in JSON, or with no body (202, 409, 404). An HTML page, such
  // as the firewall's "Request Rejected" sent with HTTP 200, or any other
  // non-JSON body where JSON is due, is not MoMo's answer: a rejection.
  const isHtml = res => contentType(res).includes('html');
  const notJson = res => contentType(res) !== '' && !contentType(res).includes('json');

  // One log line per refused call: HTTP status, content type and MoMo's own
  // code and message, the payer/payee masked. Never keys, tokens or headers.
  const failure = async (res, what, text) => {
    text ??= await res.text().catch(() => '');
    let said = {};
    try { said = JSON.parse(text) || {}; } catch { /* not JSON */ }
    const type = contentType(res);
    const code = said.code || said.error || '-';
    const raw = said.message || said.error_description || (said.code ? '' : text);
    const readable = type.includes('html') ? String(raw).replace(/<[^>]*>/g, ' ') : String(raw);
    const message = (readable.replace(/\s+/g, ' ').trim() || '-').slice(0, 200);
    const party = what === 'token' ? '' : ` party=${maskPhone(msisdn)}`;
    console.error(`[payments] momo-sandbox ${what} rejected status=${res.status} contentType=${type || '-'} code=${code} message="${message}"${party} currency=${currency}`);
    // 4xx: refused, nothing happened. 5xx: unknown, check the status later.
    return new ProviderError(`MoMo sandbox ${what} failed (${res.status}) ${text.slice(0, 200)}`, { definite: res.status < 500, status: res.status });
  };

  // A body that should be JSON; one that isn't (an HTML page without a
  // Content-Type) is a rejection too.
  const jsonOf = async (res, what) => {
    const text = await res.text().catch(() => '');
    try { return JSON.parse(text); } catch { throw await failure(res, what, text); }
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
    if (!res.ok || notJson(res)) throw await failure(res, 'token');
    const body = await jsonOf(res, 'token');
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
      externalId: safeExternalId(externalId),
      ...(api === 'collection' ? { payer: party } : { payee: party }),
      payerMessage: safeNote(note),
      payeeNote: safeNote(note)
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
    if (res.status === 202 && !isHtml(res)) return { accepted: true, duplicate: false };
    // 409: this X-Reference-Id was already accepted; nothing new moves.
    if (res.status === 409 && !isHtml(res)) return { accepted: true, duplicate: true };
    throw await failure(res, PATHS[api]);
  };

  return {
    name: 'momo-sandbox',
    currency,
    requestToPay: request => post('collection', request),
    transfer: request => post('disbursement', request),
    async getStatus(api, referenceId) {
      const res = await send(`${base}/${api}/v1_0/${PATHS[api]}/${encodeURIComponent(referenceId)}`, { headers: await headers(api) });
      if (res.status === 404 && !isHtml(res)) return { status: 'NOT_FOUND', reason: '' };
      if (!res.ok || notJson(res)) throw await failure(res, `${PATHS[api]} status`);
      const body = await jsonOf(res, `${PATHS[api]} status`);
      const raw = String(body.status || '').toUpperCase();
      const status = raw === 'SUCCESSFUL' ? 'SUCCESSFUL' : FINAL_FAILURES.includes(raw) ? 'FAILED' : 'PENDING';
      const given = typeof body.reason === 'string' ? body.reason : body.reason?.message || body.reason?.code || '';
      return { status, reason: given || (status === 'FAILED' ? raw : '') };
    }
  };
}
