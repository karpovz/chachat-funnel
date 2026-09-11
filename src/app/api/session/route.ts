import { body, endpoint, guardOrigin, ok } from "@/server/http";
import { resumeSession, sessionInputSchema } from "@/server/session";
export const runtime="nodejs";
export async function POST(request:Request) { return endpoint(async()=>{guardOrigin(request);return ok(await resumeSession(await body(request,sessionInputSchema),request.headers.get("user-agent")));}); }
