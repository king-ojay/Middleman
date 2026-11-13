// The whole flow, two people in two browser sessions: a client and a worker
// the client invited. Register both, post a job, offer, see the ranked offers
// with the reason sentence, choose and pay into escrow (fake provider), do
// the work, confirm, rate both ways, then check the worker's private earnings
// and Transactions page, and the client's Discover sentence built from the
// real rating.
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { API_LOG } from './playwright.config.js';

const client = { name: 'Clara Mukamana', phone: '0788700101', role: 'Client' };
const worker = { name: 'Walter Niyonzima', phone: '0788700202', role: 'Worker', trade: 'Plumber' };
const AREA = 'Kimironko';
const JOB = 'Kitchen tap is leaking, needs replacing';
const PRICE = '15,000 RWF';

// The latest code the console OTP provider printed for this number
// ("[otp] code for +250*****101 is 123456").
async function codeFor(phone) {
  const pattern = new RegExp(`\\[otp\\] code for \\+250\\*{5}${phone.slice(-3)} is (\\d{6})`, 'g');
  for (let i = 0; i < 50; i++) {
    const found = [...readFileSync(API_LOG, 'utf8').matchAll(pattern)];
    if (found.length) return found.at(-1)[1];
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`no OTP logged for ${phone}`);
}

async function register(page, person, inviter) {
  await page.goto('/register');
  await page.getByRole('radio', { name: new RegExp(person.role) }).click();
  if (person.trade) await page.getByRole('button', { name: person.trade, exact: true }).click();
  await page.getByLabel('Full name').fill(person.name);
  await page.getByLabel('Phone number').fill(person.phone);
  await page.getByRole('radio', { name: AREA }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Set your PIN' })).toBeVisible();
  await page.getByLabel(/Code we sent to/).fill(await codeFor(person.phone));
  await page.getByLabel('PIN digit 1').pressSequentially('1357');
  if (inviter) {
    await page.getByLabel("Inviter's phone number (optional)").fill(inviter.phone);
    await expect(page.getByText(`${inviter.name.split(' ')[0]}`, { exact: false }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText(/Invited by/)).toBeVisible();
  }
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).not.toHaveURL(/register/);
}

test('the whole flow, client and invited worker', async ({ browser }) => {
  const asClient = await (await browser.newContext()).newPage();
  const asWorker = await (await browser.newContext()).newPage();
  asClient.on('dialog', d => d.accept()); // "Pay … into escrow?"
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
    await expect(asClient.getByRole('heading', { name: 'Offers for your job' })).toBeVisible();
    jobUrl = asClient.url();
    const offer = asClient.getByRole('listitem').filter({ hasText: worker.name });
    await expect(offer.getByText('Most trusted for you')).toBeVisible();
    await expect(offer.getByText('You invited Walter.')).toBeVisible();
    await expect(offer.getByText('Your price')).toBeVisible();
    await expect(offer.getByRole('link', { name: `View profile of ${worker.name}` })).toBeVisible();
    await asClient.screenshot({ path: '.logs/05-offers.png', fullPage: true });
  });

  await test.step('6. the client chooses and pays into escrow', async () => {
    await asClient.getByRole('listitem').filter({ hasText: worker.name }).getByRole('button', { name: 'Choose' }).click();
    await asClient.getByRole('button', { name: 'Pay into escrow' }).click();
    await expect(asClient.getByRole('button', { name: 'Pay into escrow' })).toHaveCount(0);
    await expect(asClient.getByText(/held/i).first()).toBeVisible();
  });

  await test.step('7. the worker starts and marks the job done', async () => {
    await asWorker.goto(new URL(jobUrl).pathname);
    await asWorker.getByRole('button', { name: 'Start job' }).click();
    await asWorker.getByRole('button', { name: 'Mark as complete' }).click();
    await expect(asWorker.getByRole('button', { name: 'Mark as complete' })).toHaveCount(0);
  });

  await test.step('8. the client confirms and rates 5 stars', async () => {
    await asClient.goto(new URL(jobUrl).pathname);
    await asClient.getByRole('radio', { name: '5 stars' }).click();
    await asClient.getByRole('button', { name: 'Confirm job is done' }).click();
    await expect(asClient).toHaveURL(/\/my-jobs$/);
  });

  await test.step('9. the worker rates the client', async () => {
    await asWorker.goto(new URL(jobUrl).pathname);
    await asWorker.getByRole('radio', { name: '4 stars' }).click();
    await asWorker.getByRole('button', { name: 'Send rating' }).click();
    await expect(asWorker.getByText('You rated Clara')).toBeVisible();
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
    const row = asWorker.getByRole('listitem').filter({ hasText: 'Received' });
    await expect(row).toHaveCount(1);
    await expect(row.getByRole('link', { name: JOB })).toBeVisible();
    await expect(row).toContainText(`from ${client.name.split(' ')[0]} ${client.name.split(' ')[1][0]}.`);
    await expect(row).toContainText(`+${PRICE}`);
    await expect(row).toContainText('Completed');
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
