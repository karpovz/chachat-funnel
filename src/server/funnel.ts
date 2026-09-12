import { z } from "zod";
import { Prisma } from "@prisma/client";
import {
  type ClientEventInput,
  type QuizAnswerInput,
} from "@/shared/contracts";
import {
  answerOptions,
  funnelScreens,
  questionIds,
} from "@/shared/funnel-definition";
import { db } from "./db";
import { ApiError } from "./http";
import {
  activeSession,
  eventData,
  lockSession,
  publicSession,
} from "./session";
export async function answerQuestion(
  questionId: (typeof questionIds)[number],
  input: QuizAnswerInput,
) {
  if (
    input.answerIds.length !== 1 ||
    !input.answerIds.every((id) =>
      (answerOptions[questionId] as readonly string[]).includes(id),
    )
  )
    throw new ApiError(
      400,
      "invalid_answer",
      "Choose one of the available answers.",
    );
  const session = await activeSession();
  await db.$transaction(async (tx) => {
    const current = await lockSession(tx, session.id);
    const index = questionIds.indexOf(questionId);
    if (
      funnelScreens.indexOf(
        current.currentStep as (typeof funnelScreens)[number],
      ) <
      index + 1
    )
      throw new ApiError(
        409,
        "step_required",
        "Complete the previous step first.",
      );
    await tx.quizAnswer.upsert({
      where: { sessionId_questionId: { sessionId: session.id, questionId } },
      create: { sessionId: session.id, questionId, answerIds: input.answerIds },
      update: { answerIds: input.answerIds },
    });
    await tx.event.create({
      data: {
        ...eventData(
          current,
          "quiz_answered",
          { questionId, answerIds: input.answerIds, stepIndex: index + 1 },
          questionId,
        ),
        stepIndex: index + 1,
      },
    });
    if (
      funnelScreens.indexOf(
        current.currentStep as (typeof funnelScreens)[number],
      ) <=
      index + 1
    )
      await tx.funnelSession.update({
        where: { id: session.id },
        data: { currentStep: funnelScreens[index + 2] },
      });
  });
  return publicSession(session.id);
}
export async function resolveEmail(email: string) {
  const session = await activeSession();
  await db.$transaction(async (tx) => {
    const current = await lockSession(tx, session.id);
    if (
      (await tx.quizAnswer.count({
        where: { sessionId: session.id, questionId: { in: [...questionIds] } },
      })) !== questionIds.length
    )
      throw new ApiError(
        409,
        "quiz_required",
        "Complete your character match first.",
      );
    const normalizedEmail = email.trim().toLowerCase();
    if (await tx.purchase.findUnique({ where: { sessionId: session.id } })) {
      const owner = current.userId
        ? await tx.user.findUnique({ where: { id: current.userId } })
        : null;
      if (owner?.normalizedEmail === normalizedEmail) return;
      throw new ApiError(
        409,
        "checkout_started",
        "Email cannot change after checkout has started.",
      );
    }
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${normalizedEmail}, 0))::text`;
    const existing = await tx.user.findUnique({ where: { normalizedEmail } });
    const user = await tx.user.upsert({
      where: { normalizedEmail },
      create: { email: normalizedEmail, normalizedEmail },
      update: {},
    });
    const updated = await tx.funnelSession.update({
      where: { id: current.id },
      data: { userId: user.id, currentStep: "paywall" },
    });
    await tx.visitor.update({
      where: { id: session.visitorId },
      data: { lastResolvedUserId: user.id },
    });
    for (const name of ["email_submitted", "identity_resolved"])
      await tx.event.create({
        data: eventData(updated, name, { existingUser: !!existing }, "email"),
      });
  });
  return publicSession(session.id);
}
export async function ingestEvent(input: ClientEventInput) {
  const session = await activeSession();
  try {
    await db.$transaction(async (tx) => {
      const current = await lockSession(tx, session.id);
      const prior = await tx.event.findUnique({
        where: { clientEventId: input.clientEventId },
      });
      if (prior) {
        if (prior.sessionId !== session.id)
          throw new ApiError(
            409,
            "event_conflict",
            "Event identifier already belongs to another session.",
          );
        return;
      }
      let properties: Prisma.InputJsonObject = {};
      switch (input.name) {
        case "age_confirmed": {
          z.object({ confirmed: z.literal(true) }).parse(input.properties);
          properties = { confirmed: true };
          if (current.currentStep === "landing")
            await tx.funnelSession.update({
              where: { id: current.id },
              data: { currentStep: "intent" },
            });
          break;
        }
        case "back_clicked":
          properties = z
            .object({
              fromScreen: z.enum(funnelScreens),
              toScreen: z.enum(funnelScreens),
            })
            .parse(input.properties);
          break;
        case "plan_selected":
        case "payment_submitted": {
          const slug = z.string().max(64).parse(input.properties.planSlug);
          // A delayed selection/submission can describe an offer retired after the action.
          const plan = await tx.plan.findUnique({ where: { slug } });
          if (!plan)
            throw new ApiError(
              400,
              "invalid_plan",
              "Choose an available plan.",
            );
          const source =
            input.name === "plan_selected"
              ? z
                  .enum(["manual", "default"])
                  .default("manual")
                  .parse(input.properties.source)
              : undefined;
          properties =
            input.name === "plan_selected"
              ? {
                  planId: plan.id,
                  planSlug: plan.slug,
                  amountMinor: plan.amountMinor,
                  currency: plan.currency,
                  source,
                }
              : { planSlug: plan.slug };
          break;
        }
        case "install_screen_viewed":
        case "install_link_clicked": {
          const purchase = await tx.purchase.findUnique({
            where: { sessionId: session.id },
          });
          if (purchase?.status !== "succeeded")
            throw new ApiError(
              403,
              "purchase_required",
              "Complete checkout first.",
            );
          properties =
            input.name === "install_screen_viewed"
              ? { purchaseId: purchase.id }
              : {
                  destination:
                    "https://apps.apple.com/us/app/chachat-talking-ai-character/id6444773124",
                };
          break;
        }
        case "screen_viewed": {
          if (
            input.screen === "install" &&
            (await tx.purchase.findUnique({ where: { sessionId: session.id } }))
              ?.status !== "succeeded"
          )
            throw new ApiError(
              403,
              "purchase_required",
              "Complete checkout first.",
            );
          break;
        }
      }
      await tx.event.create({
        data: {
          ...eventData(current, input.name, properties, input.screen),
          clientEventId: input.clientEventId,
          stepIndex: input.screen ? funnelScreens.indexOf(input.screen) : null,
        },
      });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const prior = await db.event.findUnique({
        where: { clientEventId: input.clientEventId },
      });
      if (prior?.sessionId === session.id) return { accepted: true };
      throw new ApiError(
        409,
        "event_conflict",
        "Event identifier already belongs to another session.",
      );
    }
    throw error;
  }
  return { accepted: true };
}
export async function plans() {
  return (
    await db.plan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    })
  ).map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    amountMinor: p.amountMinor,
    currency: p.currency,
    billingDescription: p.billingDescription,
    isDefault: p.slug === "annual",
  }));
}
