import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const context = vi.hoisted(() => ({
  visitor: "",
  session: "",
  expected: null as string | null,
}));
const database = vi.hoisted(() => ({
  funnelSession: { findFirst: vi.fn() },
  visitor: { create: vi.fn() },
}));
vi.mock("../../src/server/db", () => ({ db: database }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => ({
      value: name === "chachat_visitor" ? context.visitor : context.session,
    }),
  }),
  headers: async () =>
    new Headers(
      context.expected === null
        ? {}
        : { "x-chachat-session": context.expected },
    ),
}));

import { activeSession, resumeSession } from "../../src/server/session";

beforeEach(() => {
  vi.clearAllMocks();
  context.visitor = randomUUID();
  context.session = randomUUID();
  context.expected = null;
});

describe("expected session guard", () => {
  it("accepts a matching expectation only with valid cookie ownership", async () => {
    context.expected = context.session;
    const existing = { id: context.session, visitorId: context.visitor };
    database.funnelSession.findFirst.mockResolvedValueOnce(existing);
    expect(await activeSession()).toEqual(existing);
    expect(database.funnelSession.findFirst).toHaveBeenCalledWith({
      where: {
        id: context.session,
        visitorId: context.visitor,
      },
    });
  });

  it.each(["another-session", "malformed"])(
    "rejects a %s expectation before accessing a different session",
    async (kind) => {
      context.expected =
        kind === "another-session" ? randomUUID() : "not-a-uuid";
      await expect(activeSession()).rejects.toMatchObject({
        status: 409,
        code: "session_changed",
      });
      expect(database.funnelSession.findFirst).not.toHaveBeenCalled();
    },
  );

  it("does not use the expected ID as authorization", async () => {
    context.expected = context.session;
    database.funnelSession.findFirst.mockResolvedValueOnce(null);
    await expect(activeSession()).rejects.toMatchObject({
      status: 401,
      code: "session_required",
    });
    context.visitor = "";
    await expect(activeSession()).rejects.toMatchObject({
      status: 401,
      code: "session_required",
    });
  });

  it("does not swallow a changed-session conflict during bootstrap", async () => {
    context.expected = randomUUID();
    await expect(
      resumeSession({ landingUrl: "https://example.test/" }, null),
    ).rejects.toMatchObject({ status: 409, code: "session_changed" });
    expect(database.visitor.create).not.toHaveBeenCalled();
  });
});
