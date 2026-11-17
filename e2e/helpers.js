// Shared steps for the end-to-end specs: the one-time code from the API log
// and signing up through the app (in English).
import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import { API_LOG } from './playwright.config.js';

export const AREA = 'Kimironko';

// The latest code the console OTP provider printed for this number
// ("[otp] code for +250*****101 is 123456").
export async function codeFor(phone) {
  const pattern = new RegExp(`\\[otp\\] code for \\+250\\*{5}${phone.slice(-3)} is (\\d{6})`, 'g');
  for (let i = 0; i < 50; i++) {
    const found = [...readFileSync(API_LOG, 'utf8').matchAll(pattern)];
    if (found.length) return found.at(-1)[1];
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`no OTP logged for ${phone}`);
}

export async function register(page, person, inviter) {
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

