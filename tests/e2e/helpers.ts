import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";

const choices = [
  /Someone to talk to/,
  /A supportive friend/,
  /Text conversations/,
  /My interests/,
  /A daily check-in/,
];

export async function reachCheckout(page: Page) {
  await page.goto("/?utm_source=browser-smoke&utm_medium=test#install");
  await expect(
    page.getByRole("link", { name: "Download on the App Store" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Find my character" }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "I confirm that I am 18 or older" })
    .check();
  await page.getByRole("button", { name: "Find my character" }).click();
  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toBeDisabled();
  for (const [index, choice] of choices.entries()) {
    await page.getByRole("radio", { name: choice }).check();
    if (index === 0) {
      await page.reload();
      await expect(page.getByRole("radio", { name: choice })).toBeChecked();
    }
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    if (index === 0) {
      await page.getByRole("radio", { name: choices[1] }).waitFor();
      await page.getByRole("button", { name: "Go back" }).click();
      await expect(page.getByRole("radio", { name: choice })).toBeChecked();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
    }
  }
  const email = `browser-${randomUUID()}@example.com`;
  await page.getByRole("textbox", { name: "Your email address" }).fill(email);
  await page.getByRole("button", { name: "Reveal my offer" }).click();
  await expect(
    page.getByRole("button", { name: /Continue with Annual/ }),
  ).toBeEnabled();
  return email;
}

export async function fillCard(page: Page, number: string) {
  await page
    .getByRole("textbox", { name: "Name on card", exact: true })
    .fill("QA Secret Cardholder");
  await page
    .getByRole("textbox", { name: "Card number", exact: true })
    .fill(number);
  await page
    .getByRole("textbox", { name: "Expiry date", exact: true })
    .fill(`12/${String(new Date().getUTCFullYear() + 2).slice(-2)}`);
  await page.getByLabel("Security code", { exact: true }).fill("737");
  await page
    .getByRole("textbox", { name: "Postal code", exact: true })
    .fill("10001");
}
