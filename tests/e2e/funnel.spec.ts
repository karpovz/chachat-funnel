import { expect, test } from "@playwright/test";
import { fillCard, reachCheckout } from "./helpers";

test("mobile happy path preserves answers on back/refresh and restores successful install", async ({
  page,
}) => {
  const email = await reachCheckout(page);
  await fillCard(page, "4242424242424242");
  await page.getByRole("button", { name: /Continue with Annual/ }).click();
  await expect(
    page.getByRole("link", { name: "Download on the App Store" }),
  ).toHaveAttribute(
    "href",
    "https://apps.apple.com/us/app/chachat-talking-ai-character/id6444773124",
  );
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Download on the App Store" }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  const storage = await page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }),
  );
  expect(storage).not.toContain("4242424242424242");
  expect(storage).not.toContain("QA Secret Cardholder");
});

test("decline and timeout show recoverable errors before a successful retry", async ({
  page,
}) => {
  await reachCheckout(page);
  for (const [number, message] of [
    ["4000000000000002", /declin/i],
    ["4000000000009995", /timed?\s*out|timeout/i],
  ] as const) {
    await fillCard(page, number);
    await page.getByRole("button", { name: /Continue with Annual/ }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      message,
    );
    await expect(
      page.getByRole("button", { name: /Continue with Annual/ }),
    ).toBeEnabled();
  }
  await fillCard(page, "4242424242424242");
  await page.getByRole("button", { name: /Continue with Annual/ }).click();
  await expect(
    page.getByRole("link", { name: "Download on the App Store" }),
  ).toBeVisible();
});

test("refresh during processing recovers timeout, preserves monthly plan, and permits retry", async ({
  page,
}) => {
  await reachCheckout(page);
  await page.getByRole("radio", { name: /Monthly/ }).check();
  await fillCard(page, "4000000000009995");
  await page.getByRole("button", { name: /Continue with Monthly/ }).click();
  await expect
    .poll(
      async () => {
        const response = await page.request.get("/api/purchases/current");
        const payload: unknown = await response.json();
        if (
          typeof payload !== "object" ||
          payload === null ||
          !("data" in payload)
        )
          return null;
        const data = payload.data;
        return typeof data === "object" && data !== null && "status" in data
          ? data.status
          : null;
      },
      { timeout: 3000, intervals: [50, 100] },
    )
    .toBe("processing");
  await page.reload();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    /timed?\s*out|timeout/i,
  );
  await expect(page.getByRole("radio", { name: /Monthly/ })).toBeChecked();
  await expect(
    page.getByRole("button", { name: /Continue with Monthly/ }),
  ).toBeEnabled();
  await fillCard(page, "4242424242424242");
  await page.getByRole("button", { name: /Continue with Monthly/ }).click();
  await expect(
    page.getByRole("link", { name: "Download on the App Store" }),
  ).toBeVisible();
});
