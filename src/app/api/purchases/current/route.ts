import { endpoint, ok } from "@/server/http";
import { currentPurchase } from "@/server/payments";
export async function GET() {
  return endpoint("purchases.current", async () => ok(await currentPurchase()));
}
