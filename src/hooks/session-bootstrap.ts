import { z } from "zod";
import { publicSessionSchema } from "@/shared/contracts";
import { api } from "./funnel-api";
import { copy } from "@/content/funnel";

const LOCK_NAME = "chachat:session-bootstrap";
const LEASE_MS = 30000;
const leaseSchema = z.object({
  owner: z.string().uuid(),
  expiresAt: z.number().finite(),
});
type Lease = z.infer<typeof leaseSchema>;
function openLeaseDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("chachat-coordination", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("leases");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error(copy.errors.coordination));
    request.onblocked = () => reject(new Error(copy.errors.coordination));
  });
}
function changeLease(
  database: IDBDatabase,
  owner: string,
  operation: "claim" | "renew" | "release",
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("leases", "readwrite");
    const store = transaction.objectStore("leases");
    const request = store.get(LOCK_NAME);
    let changed = false;
    request.onsuccess = () => {
      const parsed = leaseSchema.safeParse(request.result);
      const lease = parsed.success ? parsed.data : undefined;
      if (operation === "release") {
        if (lease?.owner === owner) {
          store.delete(LOCK_NAME);
          changed = true;
        }
      } else if (
        lease?.owner === owner ||
        (operation === "claim" && (!lease || lease.expiresAt <= Date.now()))
      ) {
        store.put(
          { owner, expiresAt: Date.now() + LEASE_MS } satisfies Lease,
          LOCK_NAME,
        );
        changed = true;
      }
    };
    transaction.oncomplete = () => resolve(changed);
    transaction.onerror = () => reject(new Error(copy.errors.coordination));
    transaction.onabort = () => reject(new Error(copy.errors.coordination));
  });
}
async function withLease<T>(
  operation: (signal?: AbortSignal) => Promise<T>,
): Promise<T> {
  const database = await openLeaseDatabase();
  const owner = crypto.randomUUID();
  const controller = new AbortController();
  const deadline = Date.now() + 60000;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  try {
    while (!(await changeLease(database, owner, "claim"))) {
      if (Date.now() >= deadline) throw new Error(copy.errors.coordination);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    heartbeat = setInterval(() => {
      void changeLease(database, owner, "renew")
        .then((held) => {
          if (!held) controller.abort();
        })
        .catch(() => controller.abort());
    }, 5000);
    return await operation(controller.signal);
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    await changeLease(database, owner, "release").catch(() => {});
    database.close();
  }
}
export function bootstrapSession() {
  // Capture this tab's acquisition before waiting for another tab. The winner
  // creates the session; subsequent requests resume it using the issued cookies.
  const body = {
    landingUrl: window.location.href,
    referrer: document.referrer || null,
  };
  const request = (signal?: AbortSignal) =>
    api("/session", publicSessionSchema, { method: "POST", body, signal });
  if (navigator.locks?.request)
    return navigator.locks.request(LOCK_NAME, () => request());
  if (typeof indexedDB !== "undefined") return withLease(request);
  return Promise.reject(new Error(copy.errors.coordination));
}
