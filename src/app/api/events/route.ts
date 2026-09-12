import { body, endpoint, guardOrigin, ok } from "@/server/http";
import { ingestEvent } from "@/server/funnel";
import { clientEventInputSchema } from "@/shared/contracts";
export async function POST(request: Request) {
  return endpoint("events.ingest", async () => {
    guardOrigin(request);
    return ok(await ingestEvent(await body(request, clientEventInputSchema)));
  });
}
