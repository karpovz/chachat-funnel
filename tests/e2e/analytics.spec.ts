import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { z } from "zod";
import {
  clientEventInputSchema,
  publicSessionSchema,
} from "../../src/shared/contracts";

const db = new PrismaClient();
test.afterAll(async () => {
  await db.$disconnect();
});

async function sessionId(page: Page) {
  const response = await page.request.post("/api/session", {
    data: { landingUrl: page.url() },
  });
  expect(response.ok()).toBe(true);
  return publicSessionSchema.parse((await response.json()).data).sessionId;
}

async function pending(page: Page, sessionId: string) {
  const rows: unknown = await page.evaluate(async (sessionId) => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("chachat-analytics", 1);
      request.onerror = () =>
        reject(new Error("Could not inspect queued events"));
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("events", "readonly");
        const records = transaction
          .objectStore("events")
          .index("session")
          .getAll(sessionId);
        transaction.oncomplete = () => {
          database.close();
          resolve(records.result);
        };
        transaction.onabort = () => {
          database.close();
          reject(new Error("Could not read queued events"));
        };
      };
    });
  }, sessionId);
  return z
    .array(z.object({ event: clientEventInputSchema }))
    .parse(rows)
    .map((row) => row.event);
}

test("two tabs retain pending events after closing and replay a lost acknowledgement only once", async ({
  context,
  page,
}) => {
  await context.route("**/api/events", (route) =>
    route.fulfill({ status: 503, body: "unavailable" }),
  );
  const other = await context.newPage();
  await Promise.all([
    page.goto("/?utm_source=durable-events"),
    other.goto("/"),
  ]);
  await Promise.all(
    [page, other].map((tab) =>
      expect(
        tab.getByRole("checkbox", { name: "I confirm that I am 18 or older" }),
      ).toBeVisible(),
    ),
  );
  for (const tab of [page, other]) {
    await tab
      .getByRole("checkbox", { name: "I confirm that I am 18 or older" })
      .check();
    await tab.getByRole("button", { name: "Find my character" }).click();
    await expect(
      tab.getByRole("radio", { name: /Someone to talk to/ }),
    ).toBeVisible();
  }
  const id = await sessionId(page);
  expect(await sessionId(other)).toBe(id);
  await expect
    .poll(
      async () =>
        (await pending(page, id)).filter(
          (event) => event.name === "screen_viewed",
        ).length,
    )
    .toBe(4);
  const queuedIds = (await pending(page, id)).map(
    (event) => event.clientEventId,
  );
  await Promise.all([page.close(), other.close()]);
  await context.unroute("**/api/events");
  let lostAcknowledgement: string | undefined;
  await context.route("**/api/events", async (route) => {
    const event = clientEventInputSchema.parse(route.request().postDataJSON());
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    if (!lostAcknowledgement) {
      lostAcknowledgement = event.clientEventId;
      await route.abort("failed");
    } else await route.fulfill({ response });
  });
  const returning = await context.newPage();
  const returningOther = await context.newPage();
  await Promise.all([returning.goto("/"), returningOther.goto("/")]);
  await expect(
    returning.getByRole("radio", { name: /Someone to talk to/ }),
  ).toBeVisible();
  expect(await sessionId(returning)).toBe(id);
  await expect.poll(async () => (await pending(returning, id)).length).toBe(0);
  const stored = await db.event.findMany({
    where: { sessionId: id, clientEventId: { in: queuedIds } },
  });
  expect(stored).toHaveLength(queuedIds.length);
  expect(new Set(stored.map((event) => event.clientEventId)).size).toBe(
    queuedIds.length,
  );
  expect(lostAcknowledgement).toBeDefined();
  expect(
    await db.event.count({ where: { clientEventId: lostAcknowledgement } }),
  ).toBe(1);
});

test("legacy tab events are durably imported before clearing and survive another tab visit", async ({
  context,
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Find my character" }),
  ).toBeVisible();
  const id = await sessionId(page);
  await expect.poll(async () => (await pending(page, id)).length).toBe(0);
  const legacy = clientEventInputSchema.parse({
    clientEventId: randomUUID(),
    name: "back_clicked",
    screen: "intent",
    occurredAt: new Date().toISOString(),
    properties: { fromScreen: "intent", toScreen: "landing" },
  });
  await context.route("**/api/events", (route) =>
    route.fulfill({ status: 503, body: "unavailable" }),
  );
  await page.evaluate(
    ({ id, legacy }) => {
      sessionStorage.setItem(
        `chachat:events:${id}`,
        JSON.stringify([legacy, legacy]),
      );
    },
    { id, legacy },
  );
  await page.reload();
  await expect
    .poll(
      async () =>
        (await pending(page, id)).filter(
          (event) => event.clientEventId === legacy.clientEventId,
        ).length,
    )
    .toBe(1);
  await expect
    .poll(() =>
      page.evaluate((id) => sessionStorage.getItem(`chachat:events:${id}`), id),
    )
    .toBe("[]");
  await page.close();
  await context.unroute("**/api/events");
  const returning = await context.newPage();
  await returning.goto("/");
  await expect(
    returning.getByRole("button", { name: "Find my character" }),
  ).toBeVisible();
  await expect.poll(async () => (await pending(returning, id)).length).toBe(0);
  expect(
    await db.event.count({
      where: { sessionId: id, clientEventId: legacy.clientEventId },
    }),
  ).toBe(1);
});

test("a new cookie session cannot consume the previous session's pending history", async ({
  context,
  page,
}) => {
  await context.route("**/api/events", (route) =>
    route.fulfill({ status: 503, body: "unavailable" }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Find my character" }),
  ).toBeVisible();
  const previousId = await sessionId(page);
  await expect
    .poll(async () => (await pending(page, previousId)).length)
    .toBeGreaterThan(0);
  const previousEvents = await pending(page, previousId);
  await page.close();
  await context.clearCookies();
  await context.unroute("**/api/events");
  const sent: string[] = [];
  await context.route("**/api/events", async (route) => {
    sent.push(
      clientEventInputSchema.parse(route.request().postDataJSON())
        .clientEventId,
    );
    await route.continue();
  });
  const returning = await context.newPage();
  await returning.goto("/");
  await expect(
    returning.getByRole("button", { name: "Find my character" }),
  ).toBeVisible();
  const currentId = await sessionId(returning);
  expect(currentId).not.toBe(previousId);
  await expect.poll(() => sent.length).toBeGreaterThan(0);
  await expect
    .poll(async () => (await pending(returning, currentId)).length)
    .toBe(0);
  expect(await pending(returning, previousId)).toEqual(previousEvents);
  for (const event of previousEvents)
    expect(sent).not.toContain(event.clientEventId);
  expect(
    await db.event.count({
      where: {
        clientEventId: {
          in: previousEvents.map((event) => event.clientEventId),
        },
      },
    }),
  ).toBe(0);
});

test("unavailable durable storage shows a retryable initialization error", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", { value: undefined });
  });
  await page.goto("/");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "browser storage enabled",
  );
  await expect(page.getByRole("button", { name: "Try again" })).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Find my character" }),
  ).toHaveCount(0);
});
