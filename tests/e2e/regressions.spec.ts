import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import {
  clientEventInputSchema,
  publicSessionSchema,
  purchaseInputSchema,
  type ClientEventInput,
  type PurchaseResult,
} from "../../src/shared/contracts";
import { fillCard, reachCheckout } from "./helpers";

async function sessionId(page: Page) {
  const response = await page.request.post("/api/session", {
    data: { landingUrl: page.url(), referrer: null },
  });
  expect(response.ok()).toBe(true);
  return publicSessionSchema.parse((await response.json()).data).sessionId;
}

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

for (const coordination of ["Web Locks", "IndexedDB"] as const) {
  test(`simultaneous first tabs share one session using ${coordination}`, async ({
    context,
    page,
  }) => {
    if (coordination === "IndexedDB") {
      await context.addInitScript(() => {
        Object.defineProperty(navigator, "locks", { value: undefined });
      });
    }
    const other = await context.newPage();
    const firstResponse = page.waitForResponse((response) =>
      response.url().endsWith("/api/session"),
    );
    const otherResponse = other.waitForResponse((response) =>
      response.url().endsWith("/api/session"),
    );
    await Promise.all([
      page.goto("/?utm_source=first-tabs"),
      other.goto("/?utm_source=first-tabs"),
    ]);
    const first = publicSessionSchema.parse(
      (await (await firstResponse).json()).data,
    );
    const second = publicSessionSchema.parse(
      (await (await otherResponse).json()).data,
    );
    expect(first.sessionId).toBe(second.sessionId);
    expect(await page.evaluate(() => Boolean(navigator.locks))).toBe(
      coordination === "Web Locks",
    );
    for (const tab of [page, other]) {
      await expect(
        tab.getByRole("checkbox", { name: "I confirm that I am 18 or older" }),
      ).toBeVisible();
      await tab
        .getByRole("checkbox", { name: "I confirm that I am 18 or older" })
        .check();
      await tab.getByRole("button", { name: "Find my character" }).click();
      await expect(
        tab.getByRole("radio", { name: /Someone to talk to/ }),
      ).toBeVisible();
    }
    expect(await sessionId(page)).toBe(first.sessionId);
    expect(await sessionId(other)).toBe(first.sessionId);
  });
}

test("browser Back and Forward restore answers while a direct install hash stays guarded", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("checkbox", { name: "I confirm that I am 18 or older" })
    .check();
  await page.getByRole("button", { name: "Find my character" }).click();
  await page.getByRole("radio", { name: /Someone to talk to/ }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("radio", { name: /A supportive friend/ }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#intent$/);
  await expect(
    page.getByRole("radio", { name: /Someone to talk to/ }),
  ).toBeChecked();
  await page.goForward();
  await expect(page).toHaveURL(/#character_type$/);
  await expect(
    page.getByRole("radio", { name: /A supportive friend/ }),
  ).toBeVisible();
  await page.evaluate(() => {
    window.location.hash = "install";
  });
  await expect(page).toHaveURL(/#character_type$/);
  await expect(
    page.getByRole("link", { name: "Download on the App Store" }),
  ).toHaveCount(0);
});

test("stale failed poll cannot replace a newer attempt or clear another tab payment key", async ({
  context,
  page,
}) => {
  const email = await reachCheckout(page);
  const id = await sessionId(page);
  const other = await context.newPage();
  const key = `chachat:attempt:${id}`;
  const ownKey = randomUUID();
  const otherKey = randomUUID();
  let current: PurchaseResult = {
    purchaseId: randomUUID(),
    planId: "22222222-2222-4222-8222-222222222222",
    email,
    planSlug: "annual",
    planName: "Annual",
    amountMinor: 5999,
    currency: "USD",
    billingDescription: "billed yearly",
    status: "failed",
    attemptNumber: 1,
    attemptId: randomUUID(),
    idempotencyKey: randomUUID(),
    failureCode: "card_declined",
    message: "Earlier demo attempt declined.",
  };
  let holdNextPoll = false;
  const staleStarted = deferred();
  const releaseStale = deferred();
  const staleFinished = deferred();
  await context.route("**/api/purchases/current", async (route) => {
    const snapshot = current;
    if (holdNextPoll && route.request().frame().page() === page) {
      holdNextPoll = false;
      staleStarted.release();
      await releaseStale.promise;
      await route.fulfill({ json: { data: snapshot } });
      staleFinished.release();
    } else {
      await route.fulfill({ json: { data: snapshot } });
    }
  });
  await page.evaluate(
    ({ key, ownKey }) => sessionStorage.setItem(key, JSON.stringify(ownKey)),
    { key, ownKey },
  );
  await page.reload();
  await other.goto("/#paywall");
  await other.evaluate(
    ({ key, otherKey }) =>
      sessionStorage.setItem(key, JSON.stringify(otherKey)),
    { key, otherKey },
  );
  await other.reload();
  await expect(
    page.getByRole("button", {
      name: /Continue with Annual|Recover my payment/,
    }),
  ).toBeEnabled();
  await expect(
    other.getByRole("button", {
      name: /Continue with Annual|Recover my payment/,
    }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      (key) => JSON.parse(sessionStorage.getItem(key) ?? "null"),
      key,
    ),
  ).toBe(ownKey);
  expect(
    await other.evaluate(
      (key) => JSON.parse(sessionStorage.getItem(key) ?? "null"),
      key,
    ),
  ).toBe(otherKey);

  const submitted = deferred();
  await page.route("**/api/purchases", async (route) => {
    const input = purchaseInputSchema.parse(route.request().postDataJSON());
    expect(input.idempotencyKey).toBe(ownKey);
    current = {
      ...current,
      status: "processing",
      attemptNumber: 2,
      attemptId: randomUUID(),
      idempotencyKey: ownKey,
      failureCode: null,
      message: null,
    };
    await route.fulfill({ status: 202, json: { data: current } });
    submitted.release();
  });
  holdNextPoll = true;
  await staleStarted.promise;
  await fillCard(page, "4242424242424242");
  await page
    .getByRole("button", { name: /Continue with Annual|Recover my payment/ })
    .click();
  await submitted.promise;
  await expect(
    page.getByRole("button", { name: /Processing demo payment/ }),
  ).toBeDisabled();
  releaseStale.release();
  await staleFinished.promise;
  await expect(
    page.getByRole("button", { name: /Processing demo payment/ }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      (key) => JSON.parse(sessionStorage.getItem(key) ?? "null"),
      key,
    ),
  ).toBe(ownKey);
  expect(
    await other.evaluate(
      (key) => JSON.parse(sessionStorage.getItem(key) ?? "null"),
      key,
    ),
  ).toBe(otherKey);
});

test("install shows the authoritative email changed in another tab before checkout", async ({
  context,
  page,
}) => {
  const oldEmail = await reachCheckout(page);
  const changedEmail = `changed-${randomUUID()}@example.com`;
  const other = await context.newPage();
  await other.goto("/#email");
  await other
    .getByRole("textbox", { name: "Your email address" })
    .fill(changedEmail);
  await other.getByRole("button", { name: "Reveal my offer" }).click();
  await expect(
    other.getByRole("button", { name: /Continue with Annual/ }),
  ).toBeEnabled();
  await fillCard(page, "4242424242424242");
  await page.getByRole("button", { name: /Continue with Annual/ }).click();
  await expect(page.getByText(changedEmail, { exact: true })).toBeVisible();
  await expect(page.getByText(oldEmail, { exact: true })).toHaveCount(0);
});

test("a permanently rejected analytics event does not block later views or age confirmation", async ({
  page,
}) => {
  let rejectedId: string | null = null;
  const acceptedScreens: string[] = [];
  await page.route("**/api/events", async (route) => {
    const event = clientEventInputSchema.parse(route.request().postDataJSON());
    if (!rejectedId) {
      rejectedId = event.clientEventId;
      await route.fulfill({
        status: 400,
        json: {
          error: { code: "invalid_event", message: "Rejected test event." },
        },
      });
      return;
    }
    expect(event.clientEventId).not.toBe(rejectedId);
    const response = await route.fetch();
    if (response.ok() && event.screen) acceptedScreens.push(event.screen);
    await route.fulfill({ response });
  });
  await page.goto("/");
  await page
    .getByRole("checkbox", { name: "I confirm that I am 18 or older" })
    .check();
  const confirmed = page.waitForResponse((response) =>
    response.url().endsWith("/api/session/age"),
  );
  await page.getByRole("button", { name: "Find my character" }).click();
  expect((await confirmed).ok()).toBe(true);
  await expect(
    page.getByRole("radio", { name: /Someone to talk to/ }),
  ).toBeVisible();
  await expect.poll(() => acceptedScreens).toContain("intent");
  const id = await sessionId(page);
  const diagnostics = await page.evaluate(
    (id) => sessionStorage.getItem(`chachat:event-rejections:${id}`),
    id,
  );
  expect(diagnostics).toContain(rejectedId);
});

test("the initial plan selection is recorded once and manual changes are distinct", async ({
  page,
}) => {
  const selected: ClientEventInput[] = [];
  await page.route("**/api/events", async (route) => {
    const event = clientEventInputSchema.parse(route.request().postDataJSON());
    const response = await route.fetch();
    if (response.ok() && event.name === "plan_selected") selected.push(event);
    await route.fulfill({ response });
  });
  await reachCheckout(page);
  await expect
    .poll(
      () =>
        selected.filter((event) => event.properties.source === "default")
          .length,
    )
    .toBe(1);
  expect(selected[0]?.properties).toMatchObject({
    planSlug: "annual",
    source: "default",
  });
  await page.getByRole("radio", { name: /Monthly/ }).check();
  await expect
    .poll(() =>
      selected.some(
        (event) =>
          event.properties.source === "manual" &&
          event.properties.planSlug === "monthly",
      ),
    )
    .toBe(true);
  await page.reload();
  await expect(
    page.getByRole("button", { name: /Continue with/ }),
  ).toBeEnabled();
  expect(
    new Set(
      selected
        .filter((event) => event.properties.source === "default")
        .map((event) => event.clientEventId),
    ).size,
  ).toBe(1);
});

test("a reserved plan remains payable when the active catalog is empty", async ({
  page,
}) => {
  await reachCheckout(page);
  await page.getByRole("radio", { name: /Monthly/ }).check();
  await fillCard(page, "4000000000000002");
  await page.getByRole("button", { name: /Continue with Monthly/ }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    /declin/i,
  );
  await page.route("**/api/plans", (route) =>
    route.fulfill({ json: { data: [] } }),
  );
  await page.reload();
  await expect(page.getByRole("radio", { name: /Monthly/ })).toBeChecked();
  await expect(
    page.getByRole("button", { name: /Continue with Monthly.*29\.99/ }),
  ).toBeEnabled();
  await fillCard(page, "4242424242424242");
  await page.getByRole("button", { name: /Continue with Monthly/ }).click();
  await expect(
    page.getByRole("link", { name: "Download on the App Store" }),
  ).toBeVisible();
});

test("refresh before a pending payment reaches the server preserves its Monthly plan and request key", async ({
  page,
}) => {
  await reachCheckout(page);
  const id = await sessionId(page);
  const pendingKey = randomUUID();
  await page.getByRole("radio", { name: /Monthly/ }).check();
  await page.evaluate(
    ({ id, pendingKey }) => {
      sessionStorage.setItem(
        `chachat:attempt:${id}`,
        JSON.stringify(pendingKey),
      );
      sessionStorage.setItem(
        `chachat:attempt-plan:${id}`,
        JSON.stringify({ idempotencyKey: pendingKey, planSlug: "monthly" }),
      );
    },
    { id, pendingKey },
  );
  await page.route("**/api/purchases/current", (route) =>
    route.fulfill({ json: { data: null } }),
  );
  await page.reload();
  await expect(page.getByRole("radio")).toHaveCount(3);
  await expect(page.getByRole("radio", { name: /Monthly/ })).toBeChecked();
  for (const plan of [/Monthly/, /Annual/, /Lifetime/]) {
    await expect(page.getByRole("radio", { name: plan })).toBeDisabled();
  }
  const submit = page.getByRole("button", {
    name: /Continue with Monthly|Recover my payment/,
  });
  await expect(submit).toBeEnabled();
  await fillCard(page, "4242424242424242");
  const submitted = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/purchases") && request.method() === "POST",
  );
  await submit.click();
  const input = purchaseInputSchema.parse((await submitted).postDataJSON());
  expect({
    idempotencyKey: input.idempotencyKey,
    planSlug: input.planSlug,
  }).toEqual({
    idempotencyKey: pendingKey,
    planSlug: "monthly",
  });
  await expect(
    page.getByRole("link", { name: "Download on the App Store" }),
  ).toBeVisible();
});
