import { endpoint, ok } from "@/server/http";
import { plans } from "@/server/funnel";
export async function GET() { return endpoint(async()=>ok(await plans())); }
