// A stand-in for the MTN MoMo sandbox for tests: no network, no keys. It
// answers like the sandbox does for its test payer numbers, as given for this
// project:
//   46733123450 failed, 46733123451 rejected, 46733123452 expired,
//   46733123453 stays pending; any other number succeeds.
// MTN's exact status bodies for these numbers were not checked against the
// real sandbox (scripts/momoSandboxCheck.js does that with keys), so each
// outcome comes in two encodings the provider must both handle:
//   'reason': FAILED + a reason code (how MTN documents failures)
//   'status': the outcome as its own status name (REJECTED, TIMEOUT, ONGOING)
export const SANDBOX_NUMBERS = {
  failed: '46733123450',
  rejected: '46733123451',
  expired: '46733123452',
  pending: '46733123453',
  success: '46733123459'
};

const ANSWERS = {
  reason: {
    [SANDBOX_NUMBERS.failed]: { status: 'FAILED', reason: 'INTERNAL_PROCESSING_ERROR' },
    [SANDBOX_NUMBERS.rejected]: { status: 'FAILED', reason: 'APPROVAL_REJECTED' },
    [SANDBOX_NUMBERS.expired]: { status: 'FAILED', reason: 'EXPIRED' },
    [SANDBOX_NUMBERS.pending]: { status: 'PENDING' }
  },
  status: {
    [SANDBOX_NUMBERS.failed]: { status: 'FAILED' },
    [SANDBOX_NUMBERS.rejected]: { status: 'REJECTED' },
    [SANDBOX_NUMBERS.expired]: { status: 'TIMEOUT' },
    [SANDBOX_NUMBERS.pending]: { status: 'ONGOING' }
  }
};

export const SANDBOX_ENV = {
  MOMO_COLLECTION_SUBSCRIPTION_KEY: 'col-sub', MOMO_COLLECTION_USER_ID: 'col-user', MOMO_COLLECTION_API_KEY: 'col-key',
  MOMO_DISBURSEMENT_SUBSCRIPTION_KEY: 'dis-sub', MOMO_DISBURSEMENT_USER_ID: 'dis-user', MOMO_DISBURSEMENT_API_KEY: 'dis-key'
};

/** A fetch that behaves like the sandbox: 202 for every request, then a status by payer/payee number. */
export function sandboxFetch(encoding = 'reason') {
  const numberByRef = new Map();
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    url = String(url);
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ url, method: init.method || 'GET', body });
    if (url.endsWith('/token/')) return Response.json({ access_token: 'tok', expires_in: 3600 });
    if (init.method === 'POST') {
      numberByRef.set(init.headers['X-Reference-Id'], (body.payer || body.payee).partyId);
      return new Response(null, { status: 202 });
    }
    const ref = decodeURIComponent(url.split('/').at(-1));
    if (!numberByRef.has(ref)) return new Response(null, { status: 404 });
    return Response.json(ANSWERS[encoding][numberByRef.get(ref)] || { status: 'SUCCESSFUL' });
  };
  return { fetchImpl, requests };
}
