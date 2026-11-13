// The MoMo sandbox provider against a stubbed fetch: no network, no keys.
// What these show is that the requests have the documented shape; only a run
// with real sandbox keys (scripts/momoSandboxCheck.js) shows MTN accepts them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMomoSandboxProvider, SANDBOX_HOST } from '../modules/payments/providers/momoSandbox.js';
import { SANDBOX_ENV, SANDBOX_NUMBERS, sandboxFetch } from './momoSandboxStub.js';

const ENV = {
  MOMO_COLLECTION_SUBSCRIPTION_KEY: 'col-sub', MOMO_COLLECTION_USER_ID: 'col-user', MOMO_COLLECTION_API_KEY: 'col-key',
  MOMO_DISBURSEMENT_SUBSCRIPTION_KEY: 'dis-sub', MOMO_DISBURSEMENT_USER_ID: 'dis-user', MOMO_DISBURSEMENT_API_KEY: 'dis-key'
};

// Answers token requests, then whatever `respond` returns; records every request.
const stubFetch = (respond = () => new Response(null, { status: 202 })) => {
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    const req = { url: String(url), method: init.method || 'GET', headers: init.headers || {}, body: init.body ? JSON.parse(init.body) : null };
    requests.push(req);
    if (req.url.endsWith('/token/')) return Response.json({ access_token: `tok-${req.url.includes('/collection/') ? 'col' : 'dis'}`, expires_in: 3600 });
    return respond(req);
  };
  return { requests, fetchImpl };
};

const request = { referenceId: '0b7e8d4c-9a51-4f4e-8d0a-5c1e2f3a4b5c', amount: 15000, currency: 'EUR', externalId: 'job1', party: { role: 'client', userId: 'u1' }, note: 'n' };

test('refuses any host but the sandbox, any target environment but sandbox, and missing keys', () => {
  assert.throws(() => createMomoSandboxProvider({ ...ENV, MOMO_BASE_URL: 'https://proxy.momoapi.mtn.com' }), /only talks to sandbox/);
  assert.throws(() => createMomoSandboxProvider({ ...ENV, MOMO_TARGET_ENVIRONMENT: 'mtnrwanda' }), /only uses the "sandbox"/);
  assert.throws(() => createMomoSandboxProvider({ ...ENV, MOMO_DISBURSEMENT_API_KEY: '' }), /MOMO_DISBURSEMENT_API_KEY/);
  assert.equal(createMomoSandboxProvider(ENV).name, 'momo-sandbox');
});

test('requestToPay: token, then a collection request with the idempotency key and sandbox headers', async () => {
  const { requests, fetchImpl } = stubFetch();
  const momo = createMomoSandboxProvider({ ...ENV, MOMO_CALLBACK_URL: 'https://api.example.org/api/payments/momo/callback' }, fetchImpl);
  assert.deepEqual(await momo.requestToPay(request), { accepted: true, duplicate: false });

  const [tokenReq, payReq] = requests;
  assert.equal(tokenReq.url, `https://${SANDBOX_HOST}/collection/token/`);
  assert.equal(tokenReq.headers.Authorization, `Basic ${Buffer.from('col-user:col-key').toString('base64')}`);
  assert.equal(payReq.url, `https://${SANDBOX_HOST}/collection/v1_0/requesttopay`);
  assert.equal(payReq.method, 'POST');
  assert.equal(payReq.headers.Authorization, 'Bearer tok-col');
  assert.equal(payReq.headers['X-Reference-Id'], request.referenceId);
  assert.equal(payReq.headers['X-Target-Environment'], 'sandbox');
  assert.equal(payReq.headers['Ocp-Apim-Subscription-Key'], 'col-sub');
  assert.equal(payReq.headers['X-Callback-Url'], `https://api.example.org/api/payments/momo/callback?ref=${request.referenceId}`);
  assert.deepEqual(payReq.body, {
    amount: '15000', currency: 'EUR', externalId: 'job1',
    payer: { partyIdType: 'MSISDN', partyId: '46733123480' }, payerMessage: 'n', payeeNote: 'n'
  });
});

test('transfer pays the sandbox test number, never a participant number, with the disbursement keys', async () => {
  const { requests, fetchImpl } = stubFetch();
  const momo = createMomoSandboxProvider({ ...ENV, MOMO_SANDBOX_MSISDN: '46733123481' }, fetchImpl);
  await momo.transfer({ ...request, party: { role: 'worker', userId: 'w1', phone: '+250788123456' } });
  const payReq = requests.at(-1);
  assert.equal(payReq.url, `https://${SANDBOX_HOST}/disbursement/v1_0/transfer`);
  assert.equal(payReq.headers['Ocp-Apim-Subscription-Key'], 'dis-sub');
  assert.deepEqual(payReq.body.payee, { partyIdType: 'MSISDN', partyId: '46733123481' });
  assert.equal(JSON.stringify(requests).includes('788123456'), false);
});

test('a repeated reference (409) is accepted without a second movement; 4xx is a definite failure, 5xx and no answer are not', async () => {
  const statuses = [409, 400, 500];
  const { fetchImpl } = stubFetch(() => new Response('{}', { status: statuses.shift() }));
  const momo = createMomoSandboxProvider(ENV, fetchImpl);
  assert.deepEqual(await momo.requestToPay(request), { accepted: true, duplicate: true });
  await assert.rejects(momo.requestToPay(request), err => err.definite === true && err.status === 400);
  await assert.rejects(momo.requestToPay(request), err => err.definite === false && err.status === 500);

  const offline = createMomoSandboxProvider(ENV, async () => { throw new Error('ECONNRESET'); });
  await assert.rejects(offline.transfer(request), err => err.definite === false);
});

test('getStatus: SUCCESSFUL, final failures to FAILED, everything else still PENDING, 404 to NOT_FOUND; the token is reused', async () => {
  const answers = [
    Response.json({ status: 'SUCCESSFUL' }),
    Response.json({ status: 'PENDING' }),
    Response.json({ status: 'REJECTED', reason: 'APPROVAL_REJECTED' }),
    Response.json({ status: 'ONGOING' }),
    Response.json({ status: 'SOMETHING_NEW' }),
    new Response(null, { status: 404 })
  ];
  const { requests, fetchImpl } = stubFetch(() => answers.shift());
  const momo = createMomoSandboxProvider(ENV, fetchImpl);
  assert.equal((await momo.getStatus('collection', request.referenceId)).status, 'SUCCESSFUL');
  assert.equal((await momo.getStatus('collection', request.referenceId)).status, 'PENDING');
  assert.deepEqual(await momo.getStatus('disbursement', request.referenceId), { status: 'FAILED', reason: 'APPROVAL_REJECTED' });
  // Not over yet: a payment that never finishes expires in escrow.js instead.
  assert.equal((await momo.getStatus('collection', request.referenceId)).status, 'PENDING');
  assert.equal((await momo.getStatus('collection', request.referenceId)).status, 'PENDING');
  assert.equal((await momo.getStatus('disbursement', request.referenceId)).status, 'NOT_FOUND');
  assert.equal(requests.filter(r => r.url.endsWith('/token/')).length, 2); // one per product
  assert.equal(requests.at(-1).url, `https://${SANDBOX_HOST}/disbursement/v1_0/transfer/${request.referenceId}`);
});

test('sandbox test numbers: 450 failed, 451 rejected, 452 expired end FAILED; 453 stays PENDING; in both encodings', async () => {
  for (const encoding of ['reason', 'status']) {
    for (const [outcome, expected] of [['failed', 'FAILED'], ['rejected', 'FAILED'], ['expired', 'FAILED'], ['pending', 'PENDING'], ['success', 'SUCCESSFUL']]) {
      const { fetchImpl, requests } = sandboxFetch(encoding);
      const momo = createMomoSandboxProvider({ ...SANDBOX_ENV, MOMO_SANDBOX_MSISDN: SANDBOX_NUMBERS[outcome] }, fetchImpl);
      await momo.requestToPay(request);
      assert.equal(requests.at(-1).body.payer.partyId, SANDBOX_NUMBERS[outcome]);
      const result = await momo.getStatus('collection', request.referenceId);
      assert.equal(result.status, expected, `${encoding} ${outcome}`);
      if (expected === 'FAILED') assert.ok(result.reason, `${encoding} ${outcome} keeps a reason for the ledger`);
    }
  }
});

// Captures console.error while `run` runs.
const logged = async run => {
  const lines = [];
  const error = console.error;
  console.error = (...args) => lines.push(args.join(' '));
  try { await run(); } finally { console.error = error; }
  return lines;
};

test('what a payment sends: the sandbox number (default when MOMO_SANDBOX_MSISDN is unset), EUR unless MOMO_CURRENCY says otherwise', async () => {
  const { requests, fetchImpl } = stubFetch();
  await createMomoSandboxProvider(ENV, fetchImpl).requestToPay(request);
  const pay = requests.find(r => r.url.endsWith('/requesttopay'));
  assert.deepEqual(pay.body.payer, { partyIdType: 'MSISDN', partyId: '46733123480' });
  assert.equal(pay.body.currency, 'EUR');
  assert.equal(pay.headers['X-Target-Environment'], 'sandbox');

  const other = stubFetch();
  await createMomoSandboxProvider({ ...ENV, MOMO_SANDBOX_MSISDN: '46733123454', MOMO_CURRENCY: 'RWF' }, other.fetchImpl).requestToPay(request);
  const sent = other.requests.find(r => r.url.endsWith('/requesttopay')).body;
  assert.equal(sent.payer.partyId, '46733123454');
  assert.equal(sent.currency, 'RWF'); // passed through as set: the sandbox only takes EUR
});

test('a refused payment logs one line: HTTP status, MoMo code and message, masked payer, no keys or token', async () => {
  const { fetchImpl } = stubFetch(() => Response.json({ code: 'INVALID_CURRENCY', message: 'Currency not supported.' }, { status: 400 }));
  const momo = createMomoSandboxProvider(ENV, fetchImpl);
  const lines = await logged(() => assert.rejects(momo.requestToPay(request), err => err.definite && err.status === 400));
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^\[payments\] momo-sandbox requesttopay rejected status=400 code=INVALID_CURRENCY message="Currency not supported\." party=\*{5}480 currency=EUR$/);
  for (const secret of ['col-sub', 'col-user', 'col-key', 'tok-col', '46733123480']) assert.equal(lines[0].includes(secret), false, secret);
});

test('a refused token request is logged too, without the credentials', async () => {
  const fetchImpl = async url => (String(url).endsWith('/token/')
    ? Response.json({ error: 'login_failed', error_description: 'Access denied' }, { status: 401 })
    : new Response(null, { status: 202 }));
  const momo = createMomoSandboxProvider(ENV, fetchImpl);
  const lines = await logged(() => assert.rejects(momo.requestToPay(request), err => err.definite && err.status === 401));
  assert.deepEqual(lines, ['[payments] momo-sandbox token rejected status=401 code=login_failed message="Access denied" currency=EUR']);
});
