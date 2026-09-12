import { ingestEvent } from "./funnel";
import { activeSession, publicSession } from "./session";

/** The transition shares ingestion's transaction and event UUID deduplication. */
export async function confirmAge(clientEventId: string) {
  const session = await activeSession();
  await ingestEvent({
    clientEventId,
    name: "age_confirmed",
    screen: "landing",
    occurredAt: new Date().toISOString(),
    properties: { confirmed: true },
  });
  return publicSession(session.id);
}
