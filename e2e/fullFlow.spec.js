// The whole flow, two people in two browser sessions: a client and a worker
// the client invited. Register both, post a job, offer, see the ranked offers
// with the reason sentence, choose and pay into escrow in the pay sheet (fake
// provider), do
// the work, confirm, rate both ways, then check the worker's private earnings
// and Transactions page, and the client's Discover sentence built from the
// real rating.
import { test, expect } from '@playwright/test';
import { register } from './helpers.js';

const client = { name: 'Clara Mukamana', phone: '0788700101', role: 'Client' };
const worker = { name: 'Walter Niyonzima', phone: '0788700202', role: 'Worker', trade: 'Plumber' };
const JOB = 'Kitchen tap is leaking, needs replacing';
const PRICE = '15,000 RWF';

test('the whole flow, client and invited worker', async ({ browser }) => {
  const asClient = await (await browser.newContext()).newPage();
  const asWorker = await (await browser.newContext()).newPage();
  let jobUrl;

  await test.step('1. register the client', async () => {
    await register(asClient, client);
    await expect(asClient).toHaveURL(/discover/);
  });

  await test.step("2. register the worker with the client's number as inviter", async () => {
    await register(asWorker, worker, client);
    await expect(asWorker).toHaveURL(/jobs/);
  });

  await test.step('3. the client posts a job', async () => {
    await asClient.goto('/post-job');
    await asClient.getByRole('button', { name: worker.trade, exact: true }).click();
    await asClient.getByLabel('Describe the job').fill(JOB);
    await asClient.getByLabel('Your price (RWF)').fill('15000');
    await asClient.getByRole('button', { name: 'Post job' }).click();
    await expect(asClient.getByRole('link', { name: 'See offers' })).toBeVisible();
  });

  await test.step('4. the worker sends an offer (accepts the price)', async () => {
    await asWorker.goto('/jobs');
    const card = asWorker.getByRole('listitem').filter({ hasText: JOB });
    await card.getByRole('button', { name: 'Accept', exact: true }).click();
    await asWorker.getByRole('button', { name: `Accept ${PRICE}` }).click();
    await expect(card.getByText('You responded')).toBeVisible();
  });

  await test.step('5. the client sees the ranked offers with the reason sentence', async () => {
    await asClient.getByRole('link', { name: 'See offers' }).click();
    await expect(asClient.getByText('Offers for your job')).toBeVisible();
    await expect(asClient.getByRole('heading', { name: JOB })).toBeVisible();
    await expect(asClient.getByText(PRICE).first()).toBeVisible(); // "Your price" in the header
    jobUrl = asClient.url();
    const offer = asClient.getByRole('listitem').filter({ hasText: worker.name });
    await expect(offer.getByText('Most trusted for you')).toBeVisible();
    await expect(offer.getByText('You invited Walter.')).toBeVisible();
    await expect(offer.getByText('Accepts your price')).toBeVisible();
    await expect(offer.getByRole('link', { name: `Profile of ${worker.name}` })).toBeVisible();
    await expect(offer.getByRole('button', { name: `Choose ${worker.name.split(' ')[0]}` })).toBeVisible();
    await asClient.screenshot({ path: '.logs/05-offers.png', fullPage: true });
  });

  await test.step('6. the client chooses and pays into escrow in the pay sheet', async () => {
    await asClient.getByRole('listitem').filter({ hasText: worker.name }).getByRole('button', { name: 'Choose' }).click();
    await asClient.getByRole('button', { name: 'Pay into escrow' }).click();
    const sheet = asClient.getByRole('dialog', { name: 'Pay into escrow' });
    await expect(sheet.getByText(PRICE, { exact: true })).toBeVisible();
    await expect(sheet.getByText(worker.name)).toBeVisible();
    await expect(sheet.getByText('MTN MoMo will ask the payer to approve with their PIN.')).toBeVisible();
    await expect(sheet.getByText('Test payment, no real money moves')).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Pay 15,000 RWF' })).toBeFocused(); // focus moves into the sheet
    await sheet.getByRole('button', { name: 'Pay 15,000 RWF' }).click();
    await expect(sheet.getByText('Payment held in escrow')).toBeVisible();
    await asClient.screenshot({ path: '.logs/06-paid.png' });
    await sheet.getByRole('button', { name: 'Done' }).click();
    await expect(asClient.getByRole('dialog')).toHaveCount(0);
    await expect(asClient.getByRole('button', { name: 'Pay into escrow' })).toHaveCount(0);
    await expect(asClient.getByText(/held/i).first()).toBeVisible();
    // an active job: the client can call the worker
    await expect(asClient.getByRole('link', { name: `Call ${worker.name.split(' ')[0]}` })).toHaveAttribute('href', `tel:+250${worker.phone.slice(1)}`);
  });

  await test.step('7. the worker starts and marks the job done', async () => {
    await asWorker.goto(new URL(jobUrl).pathname);
    await expect(asWorker.getByRole('link', { name: `Call ${client.name.split(' ')[0]}` })).toHaveAttribute('href', `tel:+250${client.phone.slice(1)}`);
    await asWorker.getByRole('button', { name: 'Start job' }).click();
    await asWorker.getByRole('button', { name: 'Mark as complete' }).click();
    await expect(asWorker.getByRole('button', { name: 'Mark as complete' })).toHaveCount(0);
    // FR-13: the deadline for the automatic release
    await expect(asWorker.getByText(/^Payment releases automatically on .+ unless the client confirms or reports a problem\.$/)).toBeVisible();
  });

  await test.step('8. the client confirms and rates 5 stars', async () => {
    await asClient.goto(new URL(jobUrl).pathname);
    await expect(asClient.getByText(/^Payment releases automatically on .+ unless you confirm or report a problem\.$/)).toBeVisible();
    await asClient.getByRole('radio', { name: '5 stars' }).click();
    await asClient.getByRole('button', { name: 'Confirm job is done' }).click();
    await expect(asClient).toHaveURL(/\/my-jobs$/);
  });

  await test.step('9. the worker rates the client', async () => {
    await asWorker.goto(new URL(jobUrl).pathname);
    await asWorker.getByRole('radio', { name: '4 stars' }).click();
    await asWorker.getByRole('button', { name: 'Send rating' }).click();
    await expect(asWorker.getByText('You rated Clara')).toBeVisible();
    // confirmed: no longer active, so no call button
    await expect(asWorker.getByRole('link', { name: /^Call / })).toHaveCount(0);
  });

  await test.step("10. the worker's private earnings show the amount", async () => {
    await asWorker.goto('/profile');
    const earned = asWorker.getByText('Earned on Middleman').locator('xpath=ancestor::div[contains(@class,"rounded-card")][1]');
    await expect(earned).toContainText(PRICE);
    await expect(earned).toContainText('1 completed job');
    await expect(earned).toContainText('only you can see this');
    await expect(earned).not.toContainText('Sandbox, test money');
    await asWorker.screenshot({ path: '.logs/10-earnings.png', fullPage: true });
  });

  await test.step("11. the worker's Transactions page shows the payment received", async () => {
    await asWorker.getByRole('link', { name: 'View transactions' }).click();
    await expect(asWorker.getByRole('heading', { name: 'Transactions' })).toBeVisible();
    await expect(asWorker.getByText('Only you can see this')).toBeVisible();
    const row = asWorker.getByRole('listitem').filter({ has: asWorker.getByRole('link', { name: JOB }) });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(`From ${client.name.split(' ')[0]} ${client.name.split(' ')[1][0]}.`);
    await expect(row).toContainText(`+${PRICE}`);
    await expect(row).toContainText('Received');
    await expect(row.getByText('Released (done)')).toHaveCount(1);
    await expect(asWorker.getByText('1 completed job')).toBeVisible();
    await asWorker.screenshot({ path: '.logs/11-transactions.png', fullPage: true });
  });

  await test.step("12. the client's Discover shows the worker with a sentence from the real rating", async () => {
    await asClient.goto('/discover');
    await asClient.getByRole('button', { name: worker.trade, exact: true }).click();
    const card = asClient.getByRole('listitem').filter({ hasText: worker.name });
    await expect(card).toBeVisible();
    await asClient.screenshot({ path: '.logs/12-discover.png', fullPage: true });
    await expect(card.getByText(/rated Walter 5★/)).toBeVisible();
  });
});
