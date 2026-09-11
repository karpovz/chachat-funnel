import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const choices = [/Someone to talk to/, /A supportive friend/, /Text conversations/, /My interests/, /A daily check-in/];

async function reachCheckout(page: Page) {
  await page.goto('/?utm_source=browser-smoke&utm_medium=test#install');
  await expect(page.getByRole('link', { name: 'Download on the App Store' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Find my character' })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'I confirm that I am 18 or older' }).check();
  await page.getByRole('button', { name: 'Find my character' }).click();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  for (const [index, choice] of choices.entries()) {
    await page.getByRole('radio', { name: choice }).check();
    if (index === 0) {
      await page.reload();
      await expect(page.getByRole('radio', { name: choice })).toBeChecked();
    }
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    if (index === 0) {
      await page.getByRole('radio', { name: choices[1] }).waitFor();
      await page.getByRole('button', { name: 'Go back' }).click();
      await expect(page.getByRole('radio', { name: choice })).toBeChecked();
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
    }
  }
  const email = `browser-${randomUUID()}@example.com`;
  await page.getByRole('textbox', { name: 'Your email address' }).fill(email);
  await page.getByRole('button', { name: 'Reveal my offer' }).click();
  await expect(page.getByRole('button', { name: /Continue with Annual/ })).toBeEnabled();
  return email;
}

async function fillCard(page: Page, number: string) {
  await page.getByRole('textbox', { name: 'Name on card', exact: true }).fill('QA Secret Cardholder');
  await page.getByRole('textbox', { name: 'Card number', exact: true }).fill(number);
  await page.getByRole('textbox', { name: 'Expiry date', exact: true }).fill(`12/${String(new Date().getUTCFullYear() + 2).slice(-2)}`);
  await page.getByLabel('Security code', { exact: true }).fill('737');
  await page.getByRole('textbox', { name: 'Postal code', exact: true }).fill('10001');
}

test('mobile happy path preserves answers on back/refresh and restores successful install', async ({ page }) => {
  const email = await reachCheckout(page);
  await fillCard(page, '4242424242424242');
  await page.getByRole('button', { name: /Continue with Annual/ }).click();
  await expect(page.getByRole('link', { name: 'Download on the App Store' })).toHaveAttribute('href', 'https://apps.apple.com/us/app/chachat-talking-ai-character/id6444773124');
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: 'Download on the App Store' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(storage).not.toContain('4242424242424242');
  expect(storage).not.toContain('QA Secret Cardholder');
});

test('decline and timeout show recoverable errors before a successful retry', async ({ page }) => {
  await reachCheckout(page);
  for (const [number, message] of [['4000000000000002', /declin/i], ['4000000000009995', /timed?\s*out|timeout/i]] as const) {
    await fillCard(page, number);
    await page.getByRole('button', { name: /Continue with Annual/ }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(message);
    await expect(page.getByRole('button', { name: /Continue with Annual/ })).toBeEnabled();
  }
  await fillCard(page, '4242424242424242');
  await page.getByRole('button', { name: /Continue with Annual/ }).click();
  await expect(page.getByRole('link', { name: 'Download on the App Store' })).toBeVisible();
});

test('refresh during processing recovers timeout, preserves monthly plan, and permits retry', async ({ page }) => {
  await reachCheckout(page);
  await page.getByRole('radio', { name: /Monthly/ }).check();
  await fillCard(page, '4000000000009995');
  await page.getByRole('button', { name: /Continue with Monthly/ }).click();
  await expect.poll(async () => {
    const response = await page.request.get('/api/purchases/current');
    const payload: unknown = await response.json();
    if (typeof payload !== 'object' || payload === null || !('data' in payload)) return null;
    const data = payload.data;
    return typeof data === 'object' && data !== null && 'status' in data ? data.status : null;
  }, { timeout: 3000, intervals: [50, 100] }).toBe('processing');
  await page.reload();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(/timed?\s*out|timeout/i);
  await expect(page.getByRole('radio', { name: /Monthly/ })).toBeChecked();
  await expect(page.getByRole('button', { name: /Continue with Monthly/ })).toBeEnabled();
  await fillCard(page, '4242424242424242');
  await page.getByRole('button', { name: /Continue with Monthly/ }).click();
  await expect(page.getByRole('link', { name: 'Download on the App Store' })).toBeVisible();
});
