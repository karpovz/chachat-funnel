import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function body<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    throw new ApiError(400, "invalid_json", "Please send valid JSON.");
  }
  return schema.parse(payload);
}
export type ApiOperation =
  | "session.resume"
  | "events.ingest"
  | "quiz.answer"
  | "identity.resolve"
  | "plans.list"
  | "purchases.create"
  | "purchases.current"
  | "age.confirm";
function diagnostic(error: unknown) {
  // Exception messages, stacks, metadata and user-controlled names may contain secrets.
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return {
      errorClass: "database_request",
      errorCode: /^P\d{4}$/.test(error.code) ? error.code : null,
    };
  }
  if (error instanceof Prisma.PrismaClientInitializationError)
    return { errorClass: "database_initialization", errorCode: null };
  if (error instanceof TypeError)
    return { errorClass: "type_error", errorCode: null };
  if (error instanceof RangeError)
    return { errorClass: "range_error", errorCode: null };
  return {
    errorClass: error instanceof Error ? "error" : "unknown",
    errorCode: null,
  };
}
export async function endpoint(
  operation: ApiOperation,
  run: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const correlationId = randomUUID();
  let response: NextResponse;
  try {
    response = await run();
  } catch (error) {
    if (error instanceof ApiError)
      response = NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    else if (error instanceof ZodError)
      response = NextResponse.json(
        {
          error: {
            code: "validation_error",
            message: "Please check the submitted fields.",
          },
        },
        { status: 400 },
      );
    else {
      console.error(
        JSON.stringify({
          event: "request_failed",
          operation,
          correlationId,
          ...diagnostic(error),
        }),
      );
      response = NextResponse.json(
        {
          error: {
            code: "internal_error",
            message: "Something went wrong. Please try again.",
            correlationId,
          },
        },
        { status: 500 },
      );
    }
  }
  response.headers.set("x-correlation-id", correlationId);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
export function guardOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = process.env.APP_ORIGIN ?? new URL(request.url).origin;
  if (origin && origin !== expected)
    throw new ApiError(403, "invalid_origin", "Request origin is not allowed.");
}
export function ok<T>(data: T, status = 200) {
  return NextResponse.json(
    { data },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
