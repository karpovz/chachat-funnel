import { z } from "zod";
import {
  clientEventInputSchema,
  type ClientEventInput,
} from "@/shared/contracts";
import { copy } from "@/content/funnel";

const failureSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  }),
});
export const acceptedSchema = z.object({ accepted: z.literal(true) });
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly fields?: Record<string, string[]>,
  ) {
    super(message);
  }
}
type RequestOptions = {
  method?: string;
  body?: unknown;
  sessionId?: string;
  signal?: AbortSignal;
};
export async function api<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestOptions = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: options.method ?? "GET",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.sessionId ? { "x-chachat-session": options.sessionId } : {}),
    },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(20000),
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(
      copy.errors.invalidResponse,
      "invalid_response",
      response.status,
    );
  }
  if (!response.ok) {
    const failure = failureSchema.safeParse(payload);
    throw new ApiError(
      failure.success ? failure.data.error.message : copy.errors.request,
      failure.success ? failure.data.error.code : "request_failed",
      response.status,
      failure.success ? failure.data.error.fieldErrors : undefined,
    );
  }
  const parsed = z.object({ data: schema }).safeParse(payload);
  if (!parsed.success)
    throw new ApiError(
      copy.errors.invalidResponse,
      "invalid_response",
      response.status,
    );
  return parsed.data.data;
}
export function readSafe<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? "null") as T) ?? fallback;
  } catch {
    return fallback;
  }
}
export function saveSafe(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage is optional for drafts. */
  }
}
const tabMemory = new Map<string, unknown>();
export function readTab<T>(key: string, schema: z.ZodType<T>): T | null {
  let raw: unknown;
  try {
    raw = JSON.parse(sessionStorage.getItem(key) ?? "null");
  } catch {
    raw = tabMemory.get(key);
  }
  const result = schema.safeParse(raw ?? tabMemory.get(key));
  return result.success ? result.data : null;
}
export function saveTab(key: string, value: unknown) {
  tabMemory.set(key, value);
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Keep the tab-local memory copy. */
  }
}
const drains = new Map<string, Promise<void>>();
const queueSchema = z.array(clientEventInputSchema);
const rejectionSchema = z.array(
  z.object({ id: z.string().uuid(), name: z.string(), code: z.string() }),
);
function queue(sessionId: string) {
  return readTab(`chachat:events:${sessionId}`, queueSchema) ?? [];
}
function rejectEvent(sessionId: string, event: ClientEventInput, code: string) {
  const key = `chachat:event-rejections:${sessionId}`;
  const rejected = readTab(key, rejectionSchema) ?? [];
  // Diagnostics contain identifiers and an allowlisted code, never the payload.
  const knownCodes = [
    "validation_error",
    "invalid_json",
    "invalid_origin",
    "invalid_plan",
    "purchase_required",
    "event_conflict",
  ];
  const safeCode = knownCodes.includes(code) ? code : "event_rejected";
  saveTab(
    key,
    [
      ...rejected,
      { id: event.clientEventId, name: event.name, code: safeCode },
    ].slice(-20),
  );
}
export function track(
  sessionId: string,
  event: Omit<ClientEventInput, "clientEventId" | "occurredAt">,
  clientEventId = crypto.randomUUID(),
) {
  const next = clientEventInputSchema.parse({
    ...event,
    clientEventId,
    occurredAt: new Date().toISOString(),
  });
  const existing = queue(sessionId);
  if (!existing.some((item) => item.clientEventId === clientEventId))
    saveTab(`chachat:events:${sessionId}`, [...existing, next]);
  return flushEvents(sessionId);
}
export function flushEvents(sessionId: string): Promise<void> {
  const current = drains.get(sessionId);
  if (current) return current;
  const draining = (async () => {
    for (;;) {
      const event = queue(sessionId)[0];
      if (!event) return;
      try {
        await api("/events", acceptedSchema, {
          method: "POST",
          body: event,
          sessionId,
        });
      } catch (error) {
        const permanent =
          error instanceof ApiError &&
          [400, 403, 409, 422].includes(error.status) &&
          !["session_changed", "session_required", "invalid_response"].includes(
            error.code,
          );
        if (!permanent) throw error;
        rejectEvent(sessionId, event, error.code);
      }
      saveTab(
        `chachat:events:${sessionId}`,
        queue(sessionId).filter(
          (item) => item.clientEventId !== event.clientEventId,
        ),
      );
    }
  })().finally(() => {
    drains.delete(sessionId);
  });
  drains.set(sessionId, draining);
  return draining;
}
export async function stableEventId(
  sessionId: string,
  name: string,
): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`chachat:${sessionId}:${name}`),
    ),
  ).slice(0, 16);
  bytes[6] = (bytes[6] & 15) | 0x80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
