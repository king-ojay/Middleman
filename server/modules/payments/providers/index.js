// Payment providers. Every provider has the same interface:
//   name, currency
//   requestToPay({ referenceId, amount, currency, externalId, party, note })  collect from the client into escrow
//   transfer({ referenceId, amount, currency, externalId, party, note })      pay out of escrow (release or refund)
//   getStatus(api, referenceId) -> { status: PENDING | SUCCESSFUL | FAILED | NOT_FOUND, reason }
//     api is 'collection' (requestToPay) or 'disbursement' (transfer)
// referenceId is the idempotency key: sending the same one again must never
// move money a second time. `party` is { role, userId }; providers never get
// a phone number from the app (see momoSandbox.js).
//
// PAYMENT_PROVIDER selects one: fake (default) | momo-sandbox. There is no
// live provider: no real money, ever.
import { createFakeProvider } from './fake.js';
import { createMomoSandboxProvider } from './momoSandbox.js';

export { ProviderError } from './errors.js';

let current = null;

export function getPaymentProvider(env = process.env) {
  if (current) return current;
  const name = env.PAYMENT_PROVIDER || 'fake';
  if (name === 'fake') {
    if (env.NODE_ENV === 'production') {
      console.warn('[payments] PAYMENT_PROVIDER=fake: escrow moves no money; set momo-sandbox and its MOMO_* keys to use the MTN sandbox');
    }
    current = createFakeProvider();
  } else if (name === 'momo-sandbox') {
    current = createMomoSandboxProvider(env);
  } else {
    throw new Error(`Unknown PAYMENT_PROVIDER "${name}" (use fake or momo-sandbox)`);
  }
  return current;
}

// Tests swap in their own provider.
export function setPaymentProvider(provider) {
  current = provider;
}
