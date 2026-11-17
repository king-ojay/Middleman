// The pay sheet's other paths, which the fake provider in fullFlow.spec.js
// never takes (it approves at once). The job's API answers are stubbed in the
// browser (page.route), so no server state is needed:
//   waiting for MoMo approval, then held;
//   the payment service refusing, then Try again;
//   the payer declining while it waits;
//   Tab stays in the sheet and Escape closes it.
import { test, expect } from '@playwright/test';

const JOB = '/api/jobs/job1';
const user = { _id: 'u1', name: 'Clara Mukamana', role: 'client', area: 'kimironko' };
const job = escrow => ({
  _id: 'job1', description: 'Kitchen tap is leaking', category: 'plumber', area: 'kimironko',
  status: escrow.status === 'held' ? 'escrow_held' : 'quote_accepted',
  client: { _id: 'u1', name: user.name }, worker: { _id: 'w1', name: 'Walter Niyonzima' },
  proposedPrice: 15000, agreedPrice: 15000, escrow, otherPartyPhone: '0788700202'
});
const NONE = { status: 'none' };
const PENDING = { status: 'funding', pending: { kind: 'fund' } };
const HELD = { status: 'held', amount: 15000 };
const DECLINED = { status: 'none', lastFailure: { kind: 'fund', reason: 'APPROVAL_REJECTED' } };

// Signs in (a session in localStorage) and answers the job's calls in turn:
// `fund` and `sync` are lists of [status, body] used one per call.
async function openJob(page, { fund, sync = [], keyboard = false }) {
  await page.addInitScript(u => localStorage.setItem('middleman.session', JSON.stringify({ user: u, token: 'stub' })), user);
  await page.route(`**${JOB}`, route => route.fulfill({ json: job(NONE) }));
  await page.route(`**${JOB}/fund`, route => { const [status, body] = fund.shift(); return route.fulfill({ status, json: body }); });
  await page.route(`**${JOB}/escrow/sync`, route => { const [status, body] = sync.shift() ?? [200, job(HELD)]; return route.fulfill({ status, json: body }); });
  await page.goto('/my-jobs/job1');
  const pay = page.getByRole('button', { name: 'Pay into escrow' });
  // From the keyboard: Safari doesn't focus a button on a mouse click, so
  // only a keyboard press leaves a button for focus to return to.
  if (keyboard) { await pay.focus(); await page.keyboard.press('Enter'); } else await pay.click();
  return page.getByRole('dialog', { name: 'Pay into escrow' });
}

test('waiting for MoMo approval, then held in escrow', async ({ page }) => {
  const sheet = await openJob(page, { fund: [[202, job(PENDING)]], sync: [[200, job(PENDING)], [200, job(HELD)]] });
  await sheet.getByRole('button', { name: 'Pay 15,000 RWF' }).click();
  await expect(sheet.getByText('Waiting for approval…')).toBeVisible();
  await page.screenshot({ path: '.logs/pay-waiting.png' });
  await expect(sheet.getByText('Payment held in escrow')).toBeVisible({ timeout: 20000 });
  await expect(sheet.getByText('Walter can start the work.', { exact: false })).toBeVisible();
});

test('the payment service refuses: the message, then Try again goes through', async ({ page }) => {
  const refused = { error: "The payment service didn't accept the payment. Nothing was charged. Please try again.", code: 'payment_refused' };
  const sheet = await openJob(page, { fund: [[502, refused], [200, job(HELD)]] });
  await sheet.getByRole('button', { name: 'Pay 15,000 RWF' }).click();
  await expect(sheet.getByRole('alert')).toHaveText(refused.error);
  await sheet.getByRole('button', { name: 'Try again' }).click();
  await expect(sheet.getByText('Payment held in escrow')).toBeVisible();
});

test('the payer declines while it waits: a clear failure with Try again', async ({ page }) => {
  const sheet = await openJob(page, { fund: [[202, job(PENDING)]], sync: [[200, job(DECLINED)]] });
  await sheet.getByRole('button', { name: 'Pay 15,000 RWF' }).click();
  await expect(sheet.getByRole('alert')).toContainText("The payment didn't go through. Nothing was charged.", { timeout: 20000 });
  await expect(sheet.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test('the sheet keeps focus inside and closes with Escape', async ({ page }) => {
  const sheet = await openJob(page, { fund: [], keyboard: true });
  await expect(sheet.getByRole('button', { name: 'Pay 15,000 RWF' })).toBeFocused();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    expect(await sheet.evaluate(el => el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Shift+Tab');
  expect(await sheet.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pay into escrow' })).toBeFocused();
});
