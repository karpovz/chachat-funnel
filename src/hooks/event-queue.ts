import { z } from "zod";
import { copy } from "@/content/funnel";
import {
  clientEventInputSchema,
  type ClientEventInput,
} from "@/shared/contracts";

const DATABASE = "chachat-analytics";
const STORE = "events";
const queuedEventSchema = z.object({
  id: z.number().int().positive(),
  sessionId: z.string().uuid(),
  event: clientEventInputSchema,
});
type QueuedEvent = z.infer<typeof queuedEventSchema>;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined")
    return Promise.reject(new Error(copy.errors.coordination));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      const events = request.result.createObjectStore(STORE, {
        keyPath: "id",
        autoIncrement: true,
      });
      events.createIndex("session", "sessionId");
      events.createIndex("event", ["sessionId", "event.clientEventId"], {
        unique: true,
      });
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      if (blocked) database.close();
      else resolve(database);
    };
    request.onerror = () => reject(new Error(copy.errors.coordination));
    request.onblocked = () => {
      blocked = true;
      reject(new Error(copy.errors.coordination));
    };
  });
}

async function transaction<T>(
  mode: IDBTransactionMode,
  initial: T,
  run: (store: IDBObjectStore, result: (value: T) => void) => void,
): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      let value = initial;
      transaction.oncomplete = () => resolve(value);
      transaction.onerror = transaction.onabort = () =>
        reject(new Error(copy.errors.coordination));
      try {
        run(transaction.objectStore(STORE), (next) => {
          value = next;
        });
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    });
  } finally {
    database.close();
  }
}

export async function initializeEventQueue(): Promise<void> {
  await transaction("readwrite", undefined, (store) => {
    store.count();
  });
}

export async function enqueueEvents(
  sessionId: string,
  events: ClientEventInput[],
): Promise<void> {
  if (!events.length) return;
  const validated = new Map(
    events.map((event) => {
      const parsed = clientEventInputSchema.parse(event);
      return [parsed.clientEventId, parsed] as const;
    }),
  );
  await transaction("readwrite", undefined, (store) => {
    for (const event of validated.values()) {
      const existing = store
        .index("event")
        .getKey([sessionId, event.clientEventId]);
      existing.onsuccess = () => {
        if (existing.result === undefined) store.add({ sessionId, event });
      };
    }
  });
}

export function firstQueuedEvent(
  sessionId: string,
): Promise<QueuedEvent | null> {
  return transaction<QueuedEvent | null>("readwrite", null, (store, result) => {
    // Equal session-index keys are ordered by the increasing primary key (FIFO).
    const request = store
      .index("session")
      .openCursor(IDBKeyRange.only(sessionId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const parsed = queuedEventSchema.safeParse(cursor.value);
      if (parsed.success) result(parsed.data);
      else {
        // Corrupted local records cannot poison the rest of the delivery queue.
        cursor.delete();
        cursor.continue();
      }
    };
  });
}

export async function removeQueuedEvent(id: number): Promise<void> {
  await transaction("readwrite", undefined, (store) => {
    // Delete this exact row; another tab may already have acknowledged it.
    store.delete(id);
  });
}
