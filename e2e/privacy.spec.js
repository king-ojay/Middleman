// The Privacy Policy & Terms and consent.
//   1. /privacy is public, in English and Kinyarwanda, with the version and
//      date, and is linked from the landing page.
//   2. Sign-up: Create account stays off until both boxes are ticked; the
//      policy opens in a sheet and closing it keeps everything typed; the
//      account is then created; the profile links to /privacy.
//   3. An account without consent to the current policy (consent cleared in
//      the e2e database) gets the consent screen after logging in, and
//      nothing else, until both boxes are ticked.
import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { AREA, codeFor, register } from './helpers.js';
import { checkE2eUri } from './resetDb.mjs';

const mongoose = createRequire(new URL('../server/package.json', import.meta.url))('mongoose');

test('/privacy is public, in both languages, and linked from the landing page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Privacy Policy & Terms' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy Policy & Terms' })).toBeVisible();
  await expect(page.getByText('Version 1.1 · Last updated 17 November 2026')).toBeVisible();
  await expect(page.getByText(/MongoDB Atlas, Paris, France \(AWS eu-west-3\)\. API server: Render, Oregon, USA\. Website: Vercel \(global\)\. This means your data is stored outside Rwanda\./)).toBeVisible();
  await expect(page.getByText('Pilot data will be deleted by the researcher after the study ends.')).toBeVisible();
  await expect(page.getByText(/emailing o\.attah@alustudent\.com; it is removed within 7 days\./)).toBeVisible();
  await expect(page.getByText(/REGION_TBC/)).toHaveCount(0);
  for (const heading of ['Who runs Middleman', 'What we collect', 'Why', 'Who sees what', 'Where it is stored', 'How long, and your rights', 'Security', 'Payments', 'Age', 'Rules']) {
    await expect(page.getByRole('heading', { level: 2, name: heading, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('link', { name: 'o.attah@alustudent.com' })).toHaveAttribute('href', 'mailto:o.attah@alustudent.com');
  await expect(page.getByRole('link', { name: 'Ask to delete my account' })).toHaveAttribute('href', /^mailto:o\.attah@alustudent\.com\?subject=/);
  await page.screenshot({ path: '.logs/privacy-en.png', fullPage: true });

  await page.getByRole('button', { name: 'Kinyarwanda (beta)' }).click();
  await expect(page.getByRole('heading', { level: 1, name: "Politiki y'ibanga n'amabwiriza" })).toBeVisible();
  await expect(page.getByText('Verisiyo 1.1 · Yavuguruwe ku wa 17 Ugushyingo 2026')).toBeVisible();
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

test('an account without consent to the current policy sees only the consent screen until it agrees', async ({ page }) => {
  const person = { name: 'Grace Mukamana', phone: '0788700808', role: 'Client' };
  await register(page, person);
  // As if the account were from before consent was asked for.
  await mongoose.connect(checkE2eUri(process.env.E2E_MONGO_URI));
  try {
    await mongoose.connection.collection('users').updateOne({ phone: person.phone }, { $set: { policyVersion: null, consentedAt: null, ageConfirmed: null } });
  } finally {
    await mongoose.disconnect();
  }
  await page.evaluate(() => localStorage.removeItem('middleman.session'));

  await page.goto('/login');
  await page.getByLabel('Phone number').fill(person.phone);
  await page.getByLabel('PIN').fill('1357');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Before you continue' })).toBeVisible();
  await expect(page.getByText('(version 1.1)', { exact: false })).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  const go = page.getByRole('button', { name: 'Continue' });
  await expect(go).toBeDisabled();
  await page.screenshot({ path: '.logs/consent-screen.png', fullPage: true });

  // Nothing else opens in the meantime.
  await page.goto('/my-jobs');
  await expect(page.getByRole('heading', { name: 'Before you continue' })).toBeVisible();

  await page.getByRole('checkbox', { name: 'I am 18 or older' }).check();
  await expect(go).toBeDisabled();
  await page.getByRole('checkbox', { name: /I have read and agree to the/ }).check();
  await go.click();
  await expect(page.getByRole('heading', { name: 'My jobs' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'My jobs' })).toBeVisible();
});
