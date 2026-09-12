import { afterEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError, endpoint } from "../../src/server/http";

afterEach(() => vi.restoreAllMocks());

describe("safe endpoint diagnostics", () => {
  it("correlates an unexpected failure without logging exception contents", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const secret = "4242424242424242";
    const error = Object.assign(
      new Error(`Card ${secret}; CVC=987; Demo Cardholder`),
      {
        name: secret,
        stack: secret,
        code: secret,
        card: { number: secret, cvc: "987", expiry: "12/30" },
      },
    );
    const response = await endpoint("purchases.create", async () => {
      throw error;
    });
    const correlationId = response.headers.get("x-correlation-id");
    expect(z.string().uuid().safeParse(correlationId).success).toBe(true);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        code: "internal_error",
        message: "Something went wrong. Please try again.",
        correlationId,
      },
    });
    expect(logged).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({
        event: "request_failed",
        operation: "purchases.create",
        correlationId,
        errorClass: "error",
        errorCode: null,
      }),
    );
    expect(JSON.stringify(logged.mock.calls)).not.toContain(secret);
  });

  it("logs only a safe database error code, excluding its metadata", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Prisma.PrismaClientKnownRequestError(
      "PAN 4000000000000002",
      {
        code: "P2002",
        clientVersion: "test",
        meta: {
          card: "4000000000000002",
          cvc: "987",
          cardholderName: "Never Log This",
        },
      },
    );
    const response = await endpoint("purchases.create", async () => {
      throw error;
    });
    expect(logged).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({
        event: "request_failed",
        operation: "purchases.create",
        correlationId: response.headers.get("x-correlation-id"),
        errorClass: "database_request",
        errorCode: "P2002",
      }),
    );
  });

  it("does not log expected domain or payload validation errors", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const domain = await endpoint("purchases.create", async () => {
      throw new ApiError(
        409,
        "idempotency_conflict",
        "Use a new payment request identifier.",
      );
    });
    const invalid = await endpoint("purchases.create", async () => {
      z.object({ number: z.string().max(2) }).parse({
        number: "4242424242424242",
      });
      throw new Error("unreachable");
    });
    expect(domain.status).toBe(409);
    expect(invalid.status).toBe(400);
    expect(logged).not.toHaveBeenCalled();
  });
});
