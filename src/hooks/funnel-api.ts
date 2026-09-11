import { clientEventInputSchema, type ClientEventInput } from "@/shared/contracts";

export class ApiError extends Error {
  constructor(message: string, public readonly code: string, public readonly fields?: Record<string, string[]>) { super(message); }
}
export async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, { method, credentials: "same-origin", headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000) });
  const payload = await response.json();
  if (!response.ok) throw new ApiError(payload.error?.message ?? "Something went wrong. Please try again.", payload.error?.code ?? "request_failed", payload.error?.fieldErrors);
  return payload.data as T;
}
export function readSafe<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") as T ?? fallback; } catch { return fallback; }
}
export function saveSafe(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage is optional. */ } }
let draining: Promise<void> | null = null;
const memoryQueues = new Map<string, ClientEventInput[]>();
function readQueue(key: string): ClientEventInput[] {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (Array.isArray(raw)) return raw.flatMap(item => { const parsed = clientEventInputSchema.safeParse(item); return parsed.success ? [parsed.data] : []; });
  } catch { /* Use memory if storage is unavailable. */ }
  return memoryQueues.get(key) ?? [];
}
function saveQueue(key: string, queue: ClientEventInput[]) {
  memoryQueues.set(key, queue);
  try { sessionStorage.setItem(key, JSON.stringify(queue)); } catch { /* In-memory delivery remains available. */ }
}
export function track(sessionId: string, event: Omit<ClientEventInput, "clientEventId" | "occurredAt">) {
  const key = `chachat:events:${sessionId}`;
  const next = { ...event, clientEventId: crypto.randomUUID(), occurredAt: new Date().toISOString() };
  saveQueue(key, [...readQueue(key), next]);
  return flushEvents(sessionId);
}
export function flushEvents(sessionId: string): Promise<void> {
  if (draining) return draining;
  draining = (async () => {
    const key = `chachat:events:${sessionId}`;
    for (;;) {
      const event = readQueue(key)[0];
      if (!event) return;
      await api("/events", "POST", event);
      saveQueue(key, readQueue(key).filter(item => item.clientEventId !== event.clientEventId));
    }
  })().finally(() => { draining = null; });
  return draining;
}
