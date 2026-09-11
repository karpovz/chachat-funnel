import { endpoint, ok } from "@/server/http";
import { currentPurchase } from "@/server/payments";
export async function GET() { return endpoint(async()=>ok(await currentPurchase())); }
