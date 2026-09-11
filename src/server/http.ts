import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export async function body<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let payload: unknown;
  try { payload = await request.json(); } catch { throw new ApiError(400, "invalid_json", "Please send valid JSON."); }
  return schema.parse(payload);
}
export async function endpoint(run: () => Promise<NextResponse>): Promise<NextResponse> {
  try { return await run(); } catch (error) {
    if (error instanceof ApiError) return NextResponse.json({error:{code:error.code,message:error.message}}, {status:error.status});
    if (error instanceof ZodError) return NextResponse.json({error:{code:"validation_error",message:"Please check the submitted fields."}}, {status:400});
    // Never log request bodies or exceptions that may contain card input.
    return NextResponse.json({error:{code:"internal_error",message:"Something went wrong. Please try again."}}, {status:500});
  }
}
export function guardOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = process.env.APP_ORIGIN ?? new URL(request.url).origin;
  if (origin && origin !== expected) throw new ApiError(403,"invalid_origin","Request origin is not allowed.");
}
export function ok<T>(data:T, status=200) { return NextResponse.json({data},{status,headers:{"Cache-Control":"no-store"}}); }
