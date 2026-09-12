import { body, endpoint, guardOrigin, ok } from "@/server/http";
import { resolveEmail } from "@/server/funnel";
import { emailInputSchema } from "@/shared/contracts";
export async function POST(request: Request) {
  return endpoint("identity.resolve", async () => {
    guardOrigin(request);
    return ok(
      await resolveEmail((await body(request, emailInputSchema)).email),
    );
  });
}
