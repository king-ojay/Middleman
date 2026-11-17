// Kinyarwanda (beta) and the page layout without the sandbox banner.
//   1. Switch to Kinyarwanda on the landing page; it stays after a reload and
//      sets <html lang>; log in and sign up are in Kinyarwanda, including a
//      server error translated by its code; Discover, Post a job and the
//      profile too; switching back on the profile returns to English.
//   2. No sandbox banner on any page; the test-payment notice is on the
//      Transactions page; with a phone status bar (simulated with the
//      variable Capacitor sets in the Android app) the page starts below it
//      and scrolled content never shows through it.
import { test, expect } from '@playwright/test';
import { AREA, codeFor, register } from './helpers.js';

const person = { name: 'Diane Uwimana', phone: '0788700505' };

test('Kinyarwanda: chosen on the landing page, kept after a reload, back to English on the profile', async ({ page }) => {
  await test.step('1. switch on the landing page', async () => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.getByRole('group', { name: 'Language' }).getByRole('button', { name: 'Kinyarwanda (beta)' }).click();
    await expect(page.getByRole('heading', { name: "Bona umuntu wizewe n'abantu wizera." })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'rw');
    await expect(page.getByRole('button', { name: 'Kinyarwanda (beta)' })).toHaveAttribute('aria-pressed', 'true');
  });

  await test.step('2. the choice survives a reload', async () => {
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'rw');
    await expect(page.getByRole('link', { name: 'Injira' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Uko bikora' })).toBeVisible();
  });

  await test.step('3. log in: a server error comes back translated by its code', async () => {
    await page.getByRole('link', { name: 'Injira' }).click();
    await expect(page.getByRole('heading', { name: 'Murakaza neza' })).toBeVisible();
    await page.getByLabel('Nimero ya telefoni').fill('0788700999');
    await page.getByLabel('PIN').fill('1111');
    await page.getByRole('button', { name: 'Injira', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Iyo nimero ya telefoni na PIN ntibihuye');
  });

  await test.step('4. sign up in Kinyarwanda', async () => {
    await page.getByRole('link', { name: 'Uri mushya? Fungura konti' }).click();
    await expect(page.getByRole('heading', { name: 'Fungura konti yawe' })).toBeVisible();
    await page.getByRole('radio', { name: /Umukiriya/ }).click();
    await page.getByLabel('Amazina yombi').fill(person.name);
    await page.getByLabel('Nimero ya telefoni').fill(person.phone);
    await page.getByRole('radio', { name: AREA }).click();
    await page.getByRole('button', { name: 'Komeza' }).click();
    await expect(page.getByRole('heading', { name: 'Shyiraho PIN yawe' })).toBeVisible();
    await page.getByLabel(/Kode twohereje kuri/).fill(await codeFor(person.phone));
    await page.getByLabel('PIN: umubare wa 1').pressSequentially('1357');
    await page.getByRole('checkbox', { name: 'Mfite imyaka 18 cyangwa irenga' }).check();
    await page.getByRole('checkbox', { name: /Nasomye kandi nemera/ }).check();
    await page.getByRole('button', { name: 'Fungura konti' }).click();
    await expect(page).toHaveURL(/discover/);
  });

  await test.step('5. Discover and Post a job in Kinyarwanda', async () => {
    await expect(page.getByRole('heading', { name: 'Ukeneye nde uyu munsi?' })).toBeVisible();
    await expect(page.getByText(/^(Mwaramutse|Mwiriwe), Diane$/)).toBeVisible();
    await page.getByRole('button', { name: "Umufundi w'amazi", exact: true }).click();
    await page.screenshot({ path: '.logs/rw-discover.png', fullPage: true });
    await page.goto('/post-job');
    await expect(page.getByRole('heading', { name: 'Tangaza akazi' })).toBeVisible();
    await page.getByRole('group', { name: 'Ukeneye iki?' }).getByRole('button', { name: "Umufundi w'amazi" }).click();
    await page.getByLabel('Sobanura akazi').fill('Robine yo mu gikoni irava');
    await page.getByLabel('Igiciro cyawe (RWF)').fill('12000');
    await page.getByRole('button', { name: 'Tangaza akazi' }).click();
    await expect(page.getByText('Akazi kashyizweho')).toBeVisible();
  });

  await test.step('6. back to English from the profile', async () => {
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'Ibyo ukunda' })).toBeVisible();
    await page.getByRole('group', { name: 'Ururimi' }).getByRole('button', { name: 'English' }).click();
    await expect(page.getByRole('heading', { name: 'Preferences' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Preferences' })).toBeVisible();
  });
});

test('no sandbox banner; the test-payment notice on Transactions; content stays below the status bar', async ({ page }) => {
  await register(page, { name: 'Tess Uwase', phone: '0788700606', role: 'Client' });
  await expect(page.getByText('Sandbox – no real money')).toHaveCount(0);

  await page.goto('/transactions');
  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible();
  await expect(page.getByText('Test payment, no real money moves')).toBeVisible();
  await expect(page.getByText('Sandbox – no real money')).toHaveCount(0);

  // A 40px status bar, as Capacitor reports it in the Android app.
  await page.goto('/profile');
  await page.evaluate(() => document.documentElement.style.setProperty('--safe-area-inset-top', '40px'));
  const backdrop = page.getByTestId('status-bar-backdrop');
  expect((await backdrop.boundingBox()).height).toBe(40);
  const firstHeading = await page.getByRole('heading').first().boundingBox();
  expect(firstHeading.y).toBeGreaterThanOrEqual(40);
  // Scrolled: whatever is at the top 40px is the backdrop, not page content.
  await page.evaluate(() => window.scrollTo(0, 400));
  const topElement = await page.evaluate(() => document.elementFromPoint(window.innerWidth / 2, 20)?.dataset.testid);
  expect(topElement).toBe('status-bar-backdrop');
  const [backdropColour, pageColour] = await page.evaluate(() => [
    getComputedStyle(document.querySelector('[data-testid="status-bar-backdrop"]')).backgroundColor,
    getComputedStyle(document.body.querySelector('main')).backgroundColor
  ]);
  expect(backdropColour).toBe(pageColour);
});
