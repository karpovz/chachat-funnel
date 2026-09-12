import { body, endpoint, guardOrigin, ok } from "@/server/http";
import { purchase } from "@/server/payments";
import { purchaseInputSchema } from "@/shared/contracts";
export async function POST(request: Request) {
  return endpoint("purchases.create", async () => {
    guardOrigin(request);
    const result = await purchase(await body(request, purchaseInputSchema));
    return ok(result, result.status === "processing" ? 202 : 200);
  });
}
