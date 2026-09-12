import { endpoint, ok } from "@/server/http";
import { plans } from "@/server/funnel";
export async function GET() {
  return endpoint("plans.list", async () => ok(await plans()));
}
