// A provider that moves nothing, for tests and local development. It keeps
// one record per reference, so a repeated reference is accepted again without
// a second movement, the same rule MoMo applies to X-Reference-Id.
import { ProviderError } from './errors.js';

export function createFakeProvider() {
  const records = new Map(); // `${api}:${referenceId}` -> { amount, currency, party, status, reason }
  const calls = [];          // every call, in order, for tests
  const plan = [];           // queued outcomes for the next calls, see failNext

  const take = op => {
    const i = plan.findIndex(p => p.op === op || p.op === 'any');
    return i < 0 ? null : plan.splice(i, 1)[0].outcome;
  };

  const accept = (api, op, { referenceId, amount, currency, party }) => {
    calls.push({ op, referenceId, amount, currency, party });
    const outcome = take(op);
    if (outcome === 'refuse') throw new ProviderError(`fake ${op} refused`, { definite: true, status: 400 });
    if (outcome === 'timeout') throw new ProviderError(`fake ${op} timed out`, { definite: false });
    const key = `${api}:${referenceId}`;
    if (records.has(key)) return { accepted: true, duplicate: true };
    records.set(key, {
      amount,
      currency,
      party,
      status: outcome === 'pending' ? 'PENDING' : outcome === 'fail' ? 'FAILED' : 'SUCCESSFUL',
      reason: outcome === 'fail' ? 'fake payer declined' : ''
    });
    return { accepted: true, duplicate: false };
  };

  return {
    name: 'fake',
    currency: 'RWF',
    records,
    calls,
    /**
     * The next call of `op` ('requestToPay', 'transfer', 'getStatus' or
     * 'any') will: 'refuse' (definite error), 'timeout' (uncertain error),
     * 'pending' (accepted, settles later via settle()), or 'fail' (accepted,
     * then FAILED).
     */
    failNext(op, outcome) {
      plan.push({ op, outcome });
    },
    // Settles a PENDING record, as the payer approving or declining would.
    settle(api, referenceId, status, reason = '') {
      const record = records.get(`${api}:${referenceId}`);
      if (record) Object.assign(record, { status, reason });
    },
    async requestToPay(request) {
      return accept('collection', 'requestToPay', request);
    },
    async transfer(request) {
      return accept('disbursement', 'transfer', request);
    },
    async getStatus(api, referenceId) {
      calls.push({ op: 'getStatus', api, referenceId });
      if (take('getStatus') === 'timeout') throw new ProviderError('fake getStatus timed out', { definite: false });
      const record = records.get(`${api}:${referenceId}`);
      return record ? { status: record.status, reason: record.reason } : { status: 'NOT_FOUND', reason: '' };
    }
  };
}
