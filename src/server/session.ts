import { cookies, headers } from "next/headers";
import { z } from "zod";
import type { FunnelSession, Prisma } from "@prisma/client";
import { FUNNEL_VERSION, publicSessionSchema } from "@/shared/contracts";
import { db } from "./db";
import { ApiError } from "./http";
const uuid = z.string().uuid();
export const sessionInputSchema = z.object({
  landingUrl: z.string().url().max(4096),
  referrer: z.string().max(4096).nullable().optional(),
});
export async function activeSession() {
  const [jar, requestHeaders] = await Promise.all([cookies(), headers()]);
  const visitorId = uuid.safeParse(jar.get("chachat_visitor")?.value);
  const sessionId = uuid.safeParse(jar.get("chachat_session")?.value);
  if (!visitorId.success || !sessionId.success)
    throw new ApiError(
      401,
      "session_required",
      "Start your character match first.",
    );
  const expectedSession = requestHeaders.get("x-chachat-session");
  if (expectedSession !== null) {
    const expected = uuid.safeParse(expectedSession);
    if (!expected.success || expected.data !== sessionId.data) {
      throw new ApiError(
        409,
        "session_changed",
        "Your browser session changed. Reload to continue with the current session.",
      );
    }
  }
  const session = await db.funnelSession.findFirst({
    where: { id: sessionId.data, visitorId: visitorId.data },
  });
  if (!session)
    throw new ApiError(
      401,
      "session_required",
      "Start your character match first.",
    );
  return session;
}
export function eventData(
  session: FunnelSession,
  name: string,
  properties: Prisma.InputJsonObject = {},
  screen?: string,
) {
  return {
    sessionId: session.id,
    visitorId: session.visitorId,
    userId: session.userId,
    funnelVersion: session.funnelVersion,
    name,
    properties,
    screen,
  };
}
export async function publicSession(id: string) {
  const session = await db.funnelSession.findUniqueOrThrow({
    where: { id },
    include: { user: true, answers: true, purchase: true },
  });
  return publicSessionSchema.parse({
    sessionId: id,
    currentStep: session.currentStep,
    email: session.user?.email ?? null,
    answers: Object.fromEntries(
      session.answers.map((a) => [a.questionId, a.answerIds]),
    ),
    purchaseStatus: session.purchase?.status ?? null,
  });
}
export async function resumeSession(
  input: z.infer<typeof sessionInputSchema>,
  userAgent: string | null,
) {
  try {
    return await publicSession((await activeSession()).id);
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== "session_required")
      throw error;
  }
  const jar = await cookies();
  const existingId = uuid.safeParse(jar.get("chachat_visitor")?.value);
  const existing = existingId.success
    ? await db.visitor.findUnique({ where: { id: existingId.data } })
    : null;
  const visitor = existing ?? (await db.visitor.create({ data: {} }));
  const url = new URL(input.landingUrl);
  if (!["http:", "https:"].includes(url.protocol))
    throw new ApiError(
      400,
      "invalid_url",
      "Landing URL must use HTTP or HTTPS.",
    );
  const utm = (name: string) =>
    url.searchParams.get(name)?.slice(0, 512) ?? null;
  const session = await db.$transaction(async (tx) => {
    await tx.visitor.update({
      where: { id: visitor.id },
      data: { lastSeenAt: new Date() },
    });
    const session = await tx.funnelSession.create({
      data: {
        visitorId: visitor.id,
        funnelVersion: FUNNEL_VERSION,
        landingUrl: input.landingUrl,
        referrer: input.referrer,
        userAgent: userAgent?.slice(0, 1024),
        utmSource: utm("utm_source"),
        utmMedium: utm("utm_medium"),
        utmCampaign: utm("utm_campaign"),
        utmContent: utm("utm_content"),
        utmTerm: utm("utm_term"),
      },
    });
    await tx.event.create({
      data: eventData(session, "session_started", {
        hasCampaign: !!session.utmCampaign,
        hasReferrer: !!session.referrer,
      }),
    });
    return session;
  });
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure:
      process.env.COOKIE_SECURE === "true" ||
      (process.env.NODE_ENV === "production" &&
        process.env.COOKIE_SECURE !== "false"),
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  };
  jar.set("chachat_visitor", visitor.id, options);
  jar.set("chachat_session", session.id, options);
  return publicSession(session.id);
}
export async function lockSession(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM funnel_sessions WHERE id = ${id}::uuid FOR UPDATE`;
  return tx.funnelSession.findUniqueOrThrow({ where: { id } });
}
