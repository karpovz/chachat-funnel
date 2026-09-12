import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const context = vi.hoisted(() => ({ visitor: "", session: "" }));
vi.mock("next/headers", () => ({
  cookies: async () => {
    const snapshot = { ...context };
    return {
      get: (name: string) => ({
        value: name === "chachat_visitor" ? snapshot.visitor : snapshot.session,
      }),
    };
  },
  headers: async () => new Headers({ "x-chachat-session": context.session }),
}));
import { db } from "../../src/server/db";
import {
  currentPurchase,
  purchase,
  STALE_ATTEMPT_MS,
} from "../../src/server/payments";
import { ingestEvent, resolveEmail } from "../../src/server/funnel";
import { confirmAge } from "../../src/server/age";
import { answerOptions, questionIds } from "../../src/shared/funnel-definition";
const card = {
  number: "4242424242424242",
  expiry: "12/30",
  cvc: "123",
  cardholderName: "Never Stored",
  country: "US",
  postalCode: "10001",
};
const sessions: string[] = [];
const visitors: string[] = [];
const users: string[] = [];
const plans: string[] = [];
async function fixture(email?: string) {
  const user = email
    ? await db.user.create({ data: { email, normalizedEmail: email } })
    : null;
  if (user) users.push(user.id);
  const visitor = await db.visitor.create({ data: {} });
  visitors.push(visitor.id);
  const session = await db.funnelSession.create({
    data: {
      visitorId: visitor.id,
      userId: user?.id,
      funnelVersion: "test",
      currentStep: email ? "paywall" : "email",
      landingUrl: "https://example.test/?utm_source=test",
      utmSource: "test",
    },
  });
  sessions.push(session.id);
  context.visitor = visitor.id;
  context.session = session.id;
  return session;
}
async function planFixture() {
  const plan = await db.plan.create({
    data: {
      slug: `test-${randomUUID()}`,
      name: "Reserved test offer",
      amountMinor: 2999,
      currency: "USD",
      billingDescription: "test access",
      isActive: true,
      sortOrder: 99,
    },
  });
  plans.push(plan.id);
  return plan;
}
const run = ["true", "1"].includes(process.env.RUN_DB_TESTS ?? "")
  ? describe
  : describe.skip;
run("PostgreSQL payment and identity invariants", () => {
  beforeAll(async () => {
    await db.$connect();
  });
  afterAll(async () => {
    await db.paymentAttempt.deleteMany({
      where: { purchase: { sessionId: { in: sessions } } },
    });
    await db.purchase.deleteMany({ where: { sessionId: { in: sessions } } });
    await db.plan.deleteMany({ where: { id: { in: plans } } });
    await db.event.deleteMany({ where: { sessionId: { in: sessions } } });
    await db.quizAnswer.deleteMany({ where: { sessionId: { in: sessions } } });
    await db.funnelSession.deleteMany({ where: { id: { in: sessions } } });
    await db.visitor.deleteMany({ where: { id: { in: visitors } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  });
  it("same-key concurrency yields one purchase/attempt, success terminal, no sensitive data", async () => {
    const email = `success-${randomUUID()}@example.test`;
    const session = await fixture(email);
    const input = { planSlug: "annual", idempotencyKey: randomUUID(), card };
    await Promise.all([
      purchase(input),
      purchase(input),
      purchase({ ...input, idempotencyKey: randomUUID() }),
    ]);
    const current = await currentPurchase();
    expect(current).toMatchObject({ status: "succeeded", email });
    await purchase({ ...input, idempotencyKey: randomUUID() });
    expect(await db.purchase.count({ where: { sessionId: session.id } })).toBe(
      1,
    );
    const attempts = await db.paymentAttempt.findMany({
      where: { purchase: { sessionId: session.id } },
    });
    expect(attempts).toHaveLength(1);
    expect(current).toMatchObject({
      attemptId: attempts[0]?.id,
      idempotencyKey: attempts[0]?.idempotencyKey,
    });
    const records = JSON.stringify({
      attempts,
      events: await db.event.findMany({ where: { sessionId: session.id } }),
    });
    expect(records).not.toContain(card.number);
    expect(records).not.toContain(card.cardholderName);
    expect(attempts[0]?.cardLast4).toBe("4242");
  });
  it("decline replay remains declined after successful retry and price snapshot stays authoritative", async () => {
    const session = await fixture(`decline-${randomUUID()}@example.test`);
    const plan = await planFixture();
    const input = {
      planSlug: plan.slug,
      idempotencyKey: randomUUID(),
      card: { ...card, number: "4000000000000002" },
    };
    const declined = await purchase(input);
    expect(declined.failureCode).toBe("card_declined");
    await db.plan.update({
      where: { id: plan.id },
      data: { amountMinor: 12345 },
    });
    expect(await currentPurchase()).toMatchObject({
      planId: plan.id,
      planSlug: plan.slug,
      amountMinor: 2999,
      currency: "USD",
    });
    expect(
      await purchase({ ...input, idempotencyKey: randomUUID(), card }),
    ).toMatchObject({
      status: "succeeded",
      amountMinor: 2999,
      email: declined.email,
    });
    expect(await purchase(input)).toEqual(declined);
    expect(
      (
        await db.purchase.findUniqueOrThrow({
          where: { sessionId: session.id },
        })
      ).amountMinor,
    ).toBe(2999);
    expect(
      await db.paymentAttempt.count({
        where: { purchase: { sessionId: session.id } },
      }),
    ).toBe(2);
  });
  it("same email remains resumable after checkout while ownership changes are rejected", async () => {
    const email = `resume-${randomUUID()}@example.test`;
    const session = await fixture(email);
    for (const questionId of questionIds)
      await db.quizAnswer.create({
        data: {
          sessionId: session.id,
          questionId,
          answerIds: [answerOptions[questionId][0]],
        },
      });
    await purchase({
      planSlug: "annual",
      idempotencyKey: randomUUID(),
      card: { ...card, number: "4000000000000002" },
    });
    expect((await resolveEmail(` ${email.toUpperCase()} `)).currentStep).toBe(
      "paywall",
    );
    await expect(resolveEmail("different@example.test")).rejects.toMatchObject({
      code: "checkout_started",
    });
    expect(
      (await db.funnelSession.findUniqueOrThrow({ where: { id: session.id } }))
        .userId,
    ).toBe(session.userId);
  });
  it("timeout and crashed processing are terminal and retryable", async () => {
    const session = await fixture(`timeout-${randomUUID()}@example.test`);
    const input = {
      planSlug: "annual",
      idempotencyKey: randomUUID(),
      card: { ...card, number: "4000000000009995" },
    };
    expect((await purchase(input))?.failureCode).toBe("processor_timeout");
    const order = await db.purchase.findUniqueOrThrow({
      where: { sessionId: session.id },
    });
    await db.purchase.update({
      where: { id: order.id },
      data: { status: "processing" },
    });
    await db.paymentAttempt.create({
      data: {
        purchaseId: order.id,
        idempotencyKey: randomUUID(),
        attemptNumber: 2,
        status: "processing",
        startedAt: new Date(Date.now() - STALE_ATTEMPT_MS - 1000),
      },
    });
    expect((await currentPurchase())?.failureCode).toBe("processor_timeout");
    expect(
      (await purchase({ ...input, idempotencyKey: randomUUID(), card }))
        ?.status,
    ).toBe("succeeded");
  });
  it("database rejects a second active processing attempt", async () => {
    const session = await fixture(`constraint-${randomUUID()}@example.test`);
    await purchase({
      planSlug: "annual",
      idempotencyKey: randomUUID(),
      card: { ...card, number: "4000000000000002" },
    });
    const order = await db.purchase.findUniqueOrThrow({
      where: { sessionId: session.id },
    });
    await db.paymentAttempt.create({
      data: {
        purchaseId: order.id,
        idempotencyKey: randomUUID(),
        attemptNumber: 2,
        status: "processing",
      },
    });
    await expect(
      db.paymentAttempt.create({
        data: {
          purchaseId: order.id,
          idempotencyKey: randomUUID(),
          attemptNumber: 3,
          status: "processing",
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
  it("event dedup strips arbitrary sensitive properties", async () => {
    const session = await fixture();
    const input = {
      clientEventId: randomUUID(),
      name: "screen_viewed" as const,
      screen: "email" as const,
      occurredAt: new Date().toISOString(),
      properties: {
        email: "leak@example.test",
        cardNumber: card.number,
        cvc: card.cvc,
      },
    };
    await Promise.all([ingestEvent(input), ingestEvent(input)]);
    const events = await db.event.findMany({
      where: { sessionId: session.id },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.properties).toEqual({});
  });
  it("concurrent age confirmation replays one event and advances the authoritative step", async () => {
    const session = await fixture();
    await db.funnelSession.update({
      where: { id: session.id },
      data: { currentStep: "landing" },
    });
    const clientEventId = randomUUID();
    const responses = await Promise.all([
      confirmAge(clientEventId),
      confirmAge(clientEventId),
    ]);
    expect(
      responses.every((response) => response.currentStep === "intent"),
    ).toBe(true);
    expect(
      await db.event.count({
        where: { sessionId: session.id, name: "age_confirmed", clientEventId },
      }),
    ).toBe(1);
    expect(
      await db.funnelSession.findUniqueOrThrow({ where: { id: session.id } }),
    ).toMatchObject({ currentStep: "intent" });
  });
  it("normalized existing email preserves anonymous history via session", async () => {
    const email = `identity-${randomUUID()}@example.test`;
    const original = await fixture(email);
    const userId = original.userId;
    const session = await fixture();
    for (const questionId of questionIds)
      await db.quizAnswer.create({
        data: {
          sessionId: session.id,
          questionId,
          answerIds: [answerOptions[questionId][0]],
        },
      });
    await ingestEvent({
      clientEventId: randomUUID(),
      name: "screen_viewed",
      screen: "email",
      occurredAt: new Date().toISOString(),
      properties: {},
    });
    await resolveEmail(` ${email.toUpperCase()} `);
    expect(
      (await db.funnelSession.findUniqueOrThrow({ where: { id: session.id } }))
        .userId,
    ).toBe(userId);
    expect(await db.user.count({ where: { normalizedEmail: email } })).toBe(1);
    expect(
      await db.event.count({
        where: { session: { userId }, name: "screen_viewed" },
      }),
    ).toBe(1);
  });
  it("retries a retired reserved offer but rejects new purchases of that offer", async () => {
    const session = await fixture(`retired-${randomUUID()}@example.test`);
    const plan = await planFixture();
    const declined = await purchase({
      planSlug: plan.slug,
      idempotencyKey: randomUUID(),
      card: { ...card, number: "4000000000000002" },
    });
    await db.plan.update({
      where: { id: plan.id },
      data: { isActive: false, amountMinor: 98765, name: "Retired offer" },
    });
    await ingestEvent({
      clientEventId: randomUUID(),
      name: "plan_selected",
      screen: "paywall",
      occurredAt: new Date().toISOString(),
      properties: { planSlug: plan.slug, source: "default" },
    });
    const recovered = await purchase({
      planSlug: plan.slug,
      idempotencyKey: randomUUID(),
      card,
    });
    expect(recovered).toMatchObject({
      status: "succeeded",
      purchaseId: declined.purchaseId,
      planId: plan.id,
      planName: plan.name,
      amountMinor: plan.amountMinor,
      email: declined.email,
      attemptNumber: 2,
    });
    expect(
      await db.event.findFirst({
        where: { sessionId: session.id, name: "plan_selected" },
      }),
    ).toMatchObject({ properties: { source: "default", planSlug: plan.slug } });
    const newcomer = await fixture(`retired-new-${randomUUID()}@example.test`);
    await expect(
      purchase({ planSlug: plan.slug, idempotencyKey: randomUUID(), card }),
    ).rejects.toMatchObject({ status: 400, code: "invalid_plan" });
    expect(await db.purchase.count({ where: { sessionId: newcomer.id } })).toBe(
      0,
    );
  });
  it("returns a domain conflict when different sessions concurrently reuse a payment key", async () => {
    const first = await fixture(`key-first-${randomUUID()}@example.test`);
    const second = await fixture(`key-second-${randomUUID()}@example.test`);
    const input = { planSlug: "annual", idempotencyKey: randomUUID(), card };
    context.visitor = first.visitorId;
    context.session = first.id;
    const firstRequest = purchase(input);
    context.visitor = second.visitorId;
    context.session = second.id;
    const responses = await Promise.allSettled([firstRequest, purchase(input)]);
    expect(
      responses.filter((response) => response.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      responses.find((response) => response.status === "rejected"),
    ).toMatchObject({ reason: { status: 409, code: "idempotency_conflict" } });
    expect(
      await db.paymentAttempt.count({
        where: { idempotencyKey: input.idempotencyKey },
      }),
    ).toBe(1);
    expect(
      await db.purchase.count({
        where: { sessionId: { in: [first.id, second.id] } },
      }),
    ).toBe(1);
  });
});
