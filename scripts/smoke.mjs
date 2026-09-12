#!/usr/bin/env node
// Run against a disposable test database: this deliberately retains its evidence.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const base = process.env.BASE_URL ?? "http://localhost:3000";
assert.ok(
  process.env.DATABASE_URL,
  "DATABASE_URL is required for persistence assertions",
);
const db = new PrismaClient();
const runId = randomUUID();
const email = `smoke-${runId}@example.com`;
const referrer = "https://example.com/qa-referral";
const landingUrl = `${base}/?utm_source=smoke&utm_medium=test&utm_campaign=${runId}&utm_content=card&utm_term=characters`;
const answers = [
  ["intent", "talk"],
  ["character_type", "friend"],
  ["interaction_mode", "text"],
  ["memory", "interests"],
  ["usage_moment", "daily"],
];

function browser() {
  const cookies = new Map();
  return async (
    path,
    body,
    method = body === undefined ? "GET" : "POST",
    expected = [200, 201, 202],
  ) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        origin: process.env.APP_ORIGIN ?? base,
        cookie: [...cookies]
          .map(([key, value]) => `${key}=${value}`)
          .join("; "),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const split = pair.indexOf("=");
      cookies.set(pair.slice(0, split), pair.slice(split + 1));
    }
    // Never print response/request bodies: checkout payloads contain demo secrets.
    assert.ok(
      expected.includes(response.status),
      `${method} ${path}: unexpected HTTP ${response.status}`,
    );
    const result = await response.json();
    return result.data;
  };
}

const event = (name, screen, properties = {}) => ({
  clientEventId: randomUUID(),
  name,
  screen,
  occurredAt: new Date().toISOString(),
  properties,
});
const card = (number) => ({
  number,
  expiry: `12/${String(new Date().getUTCFullYear() + 2).slice(-2)}`,
  cvc: "737",
  cardholderName: "QA Secret Cardholder",
  country: "US",
  postalCode: "10001",
});
const checkout = (number, key = randomUUID()) => ({
  planSlug: "annual",
  idempotencyKey: key,
  card: card(number),
  amountMinor: 1,
  currency: "XXX",
});

async function prepare(client, submittedEmail = email) {
  const session = await client("/api/session", { landingUrl, referrer });
  assert.equal(session.email, null);
  await client("/api/session/age", { clientEventId: randomUUID() });
  for (const [question, answer] of answers)
    await client(`/api/quiz/${question}`, { answerIds: [answer] }, "PUT");
  await client("/api/identity/email", { email: submittedEmail });
  return session.sessionId;
}

async function finalState(client) {
  for (let tries = 0; tries < 80; tries++) {
    const result = await client("/api/purchases/current");
    if (result?.status !== "processing") return result;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail("Processing did not finish within eight seconds");
}

try {
  const client = browser();
  const first = await client("/api/session", { landingUrl, referrer });
  await client(
    "/api/purchases",
    checkout("4242424242424242"),
    "POST",
    [400, 403, 409],
  );
  await client(
    "/api/events",
    event("install_screen_viewed", "install"),
    "POST",
    [400, 403, 409],
  );
  const sessionId = await prepare(client, `  ${email.toUpperCase()}  `);
  assert.equal(first.sessionId, sessionId);
  await client("/api/session", {
    landingUrl: `${base}/?utm_source=overwritten`,
    referrer: null,
  });
  await client(
    "/api/events",
    event("purchase_succeeded", "paywall"),
    "POST",
    [400],
  );
  const duplicate = event("screen_viewed", "paywall");
  await Promise.all([
    client("/api/events", duplicate),
    client("/api/events", duplicate),
  ]);
  const same = checkout("4242424242424242");
  const responses = await Promise.all([
    client("/api/purchases", same),
    client("/api/purchases", same),
  ]);
  assert.equal(responses[0].purchaseId, responses[1].purchaseId);
  assert.equal((await finalState(client)).status, "succeeded");
  assert.equal((await client("/api/purchases", same)).status, "succeeded");
  assert.equal(
    (await client("/api/purchases", checkout("4000000000000002"))).status,
    "succeeded",
  );
  await client(
    "/api/events",
    event("install_screen_viewed", "install", {
      purchaseId: responses[0].purchaseId,
    }),
  );

  const secondClient = browser();
  const secondId = await prepare(secondClient);
  const failedPayload = checkout("4000000000000002");
  assert.equal(
    (await secondClient("/api/purchases", failedPayload)).failureCode,
    "card_declined",
  );
  assert.equal(
    (await secondClient("/api/purchases", failedPayload)).attemptNumber,
    1,
  );
  const timeoutPayload = checkout("4000000000009995");
  const timeout = await secondClient("/api/purchases", timeoutPayload);
  assert.equal(timeout.status, "failed");
  assert.equal(timeout.attemptNumber, 2);
  assert.deepEqual(
    await secondClient("/api/purchases", timeoutPayload),
    timeout,
  );
  assert.equal(
    (await secondClient("/api/purchases", checkout("4242424242424242"))).status,
    "succeeded",
  );
  // Stored failed results remain stable even after later success.
  assert.equal(
    (await secondClient("/api/purchases", failedPayload)).failureCode,
    "card_declined",
  );

  const thirdClient = browser();
  const thirdId = await prepare(thirdClient);
  await thirdClient(
    "/api/purchases",
    checkout("1111111111111111"),
    "POST",
    [400],
  );
  await Promise.all([
    thirdClient("/api/purchases", checkout("4242424242424242")),
    thirdClient("/api/purchases", checkout("4242424242424242")),
  ]);
  assert.equal((await finalState(thirdClient)).status, "succeeded");

  const sessions = await db.funnelSession.findMany({
    where: { id: { in: [sessionId, secondId, thirdId] } },
    include: {
      events: true,
      purchase: { include: { attempts: true } },
      answers: true,
    },
  });
  assert.equal(sessions.length, 3);
  assert.equal(new Set(sessions.map((session) => session.userId)).size, 1);
  assert.ok(sessions[0].userId);
  assert.equal(await db.user.count({ where: { normalizedEmail: email } }), 1);
  assert.equal(
    await db.event.count({ where: { clientEventId: duplicate.clientEventId } }),
    1,
  );
  for (const session of sessions) {
    assert.equal(session.utmSource, "smoke");
    assert.equal(session.utmCampaign, runId);
    assert.equal(session.referrer, referrer);
    assert.equal(session.landingUrl, landingUrl);
    assert.equal(session.answers.length, 5);
    assert.equal(session.purchase.amountMinor, 5999);
    assert.equal(session.purchase.currency, "USD");
    assert.equal(session.purchase.status, "succeeded");
    assert.equal(
      session.purchase.attempts.length,
      session.id === secondId ? 3 : 1,
    );
    assert.equal(
      session.events.filter((row) => row.name === "purchase_succeeded").length,
      1,
    );
    for (const name of [
      "session_started",
      "email_submitted",
      "identity_resolved",
      "quiz_answered",
      "purchase_attempted",
    ])
      assert.ok(
        session.events.some((row) => row.name === name),
        `Missing ${name}`,
      );
    const persisted = JSON.stringify(session);
    for (const secret of [
      "4242424242424242",
      "4000000000000002",
      "4000000000009995",
      "QA Secret Cardholder",
      '"cvc"',
      '"expiry"',
    ])
      assert.ok(!persisted.includes(secret), "Sensitive card data persisted");
    for (const row of session.events)
      assert.ok(
        !JSON.stringify(row.properties).includes(email),
        "Email leaked to event properties",
      );
  }
  const retry = sessions.find((session) => session.id === secondId);
  assert.deepEqual(
    retry.purchase.attempts
      .sort((a, b) => a.attemptNumber - b.attemptNumber)
      .map((attempt) => attempt.status),
    ["declined", "timed_out", "succeeded"],
  );
  console.log(`PASS: API + database acceptance checks; run ${runId}`);
} finally {
  await db.$disconnect();
}
