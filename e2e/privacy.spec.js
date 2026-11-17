// The Privacy Policy & Terms and consent at sign-up.
//   1. /privacy is public, in English and Kinyarwanda, with the version and
//      date, and is linked from the landing page.
//   2. Sign-up: Create account stays off until both boxes are ticked; the
//      policy opens in a sheet and closing it keeps everything typed; the
//      account is then created; the profile links to /privacy.
import { test, expect } from '@playwright/test';
import { AREA, codeFor } from './helpers.js';

test('/privacy is public, in both languages, and linked from the landing page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Privacy Policy & Terms' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy Policy & Terms' })).toBeVisible();
  await expect(page.getByText('Version 1.0 · Last updated 17 November 2026')).toBeVisible();
  for (const heading of ['Who runs Middleman', 'What we collect', 'Why', 'Who sees what', 'Where it is stored', 'How long, and your rights', 'Security', 'Payments', 'Age', 'Rules']) {
    await expect(page.getByRole('heading', { level: 2, name: heading, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('link', { name: 'o.attah@alustudent.com' })).toHaveAttribute('href', 'mailto:o.attah@alustudent.com');
  await expect(page.getByRole('link', { name: 'Ask to delete my account' })).toHaveAttribute('href', /^mailto:o\.attah@alustudent\.com\?subject=/);
  await page.screenshot({ path: '.logs/privacy-en.png', fullPage: true });

  await page.getByRole('button', { name: 'Kinyarwanda (beta)' }).click();
  await expect(page.getByRole('heading', { level: 1, name: "Politiki y'ibanga n'amabwiriza" })).toBeVisible();
  await expect(page.getByText('Verisiyo 1.0 · Yavuguruwe ku wa 17 Ugushyingo 2026')).toBeVisible();
  await page.getByRole('button', { name: 'English' }).click();
});

test('sign-up needs both boxes; the policy opens in a sheet without losing the form', async ({ page }) => {
  const phone = '0788700707';
  await page.goto('/register');
  await page.getByRole('radio', { name: /Client/ }).click();
  await page.getByLabel('Full name').fill('Rose Uwera');
  await page.getByLabel('Phone number').fill(phone);
  await page.getByRole('radio', { name: AREA }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Set your PIN' })).toBeVisible();
  await page.getByLabel(/Code we sent to/).fill(await codeFor(phone));
  await page.getByLabel('PIN digit 1').pressSequentially('1357');

  const create = page.getByRole('button', { name: 'Create account' });
  const age = page.getByRole('checkbox', { name: 'I am 18 or older' });
  const agree = page.getByRole('checkbox', { name: /I have read and agree to the/ });
  await expect(create).toBeDisabled();
  await age.check();
  await expect(create).toBeDisabled();
  await page.screenshot({ path: '.logs/consent-en.png', fullPage: true });

  // The policy's name opens it in a sheet; closing it keeps the form as it was.
  await page.getByRole('button', { name: 'Privacy Policy & Terms' }).click();
  const sheet = page.getByRole('dialog', { name: 'Privacy Policy & Terms' });
  await expect(sheet.getByRole('heading', { name: 'Who sees what' })).toBeVisible();
  await expect(agree).not.toBeChecked(); // opening it didn't tick the box
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByLabel(/Code we sent to/)).not.toHaveValue('');
  await expect(page.getByLabel('PIN digit 4')).not.toHaveValue('');
  await expect(age).toBeChecked();

  await age.uncheck();
  await agree.check();
  await expect(create).toBeDisabled();
  await age.check();
  await expect(create).toBeEnabled();
  await create.click();
  await expect(page).toHaveURL(/discover/);

  await page.goto('/profile');
  await page.getByRole('link', { name: 'Privacy Policy & Terms' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
});
