import { ageInputSchema } from "@/shared/contracts";
import { confirmAge } from "@/server/age";
import { body, endpoint, guardOrigin, ok } from "@/server/http";

export async function POST(request: Request) {
  return endpoint("age.confirm", async () => {
    guardOrigin(request);
    const input = await body(request, ageInputSchema);
    return ok(await confirmAge(input.clientEventId));
  });
}
