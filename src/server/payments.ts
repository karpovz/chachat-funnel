import { Prisma, type PaymentAttempt, type Purchase } from "@prisma/client";
import type { PurchaseInput, PurchaseResult } from "@/shared/contracts";
import { db } from "./db";
import { ApiError } from "./http";
import { activeSession, eventData, lockSession } from "./session";
import { processCard, validateCard } from "./processor";
export const STALE_ATTEMPT_MS = 15_000;
async function result(
  tx: Prisma.TransactionClient,
  purchase: Purchase,
  attempt: PaymentAttempt | null,
): Promise<PurchaseResult> {
  const owner = await tx.user.findUniqueOrThrow({
    where: { id: purchase.userId },
    select: { email: true },
  });
  const state = attempt?.status ?? purchase.status;
  return {
    purchaseId: purchase.id,
    planId: purchase.planId,
    planSlug: purchase.planSlug,
    planName: purchase.planName,
    amountMinor: purchase.amountMinor,
    currency: purchase.currency,
    billingDescription: purchase.billingDescription,
    email: owner.email,
    status:
      state === "succeeded"
        ? "succeeded"
        : state === "processing" || state === "created"
          ? "processing"
          : "failed",
    attemptId: attempt?.id ?? null,
    idempotencyKey: attempt?.idempotencyKey ?? null,
    attemptNumber: attempt?.attemptNumber ?? null,
    failureCode: attempt?.failureCode ?? purchase.failureCode,
    message: attempt?.failureMessage ?? purchase.failureMessage,
  };
}
async function finish(
  tx: Prisma.TransactionClient,
  purchase: Purchase,
  attempt: PaymentAttempt,
  outcome: "succeeded" | "declined" | "timed_out" | "failed",
) {
  const now = new Date();
  const failureCode =
    outcome === "succeeded"
      ? null
      : outcome === "declined"
        ? "card_declined"
        : outcome === "timed_out"
          ? "processor_timeout"
          : "processor_error";
  const failureMessage =
    outcome === "succeeded"
      ? null
      : outcome === "declined"
        ? "Your demo card was declined. Try another card."
        : outcome === "timed_out"
          ? "The processor timed out. Please try again."
          : "Payment could not complete. Please try again.";
  const durationMs = Math.max(0, now.getTime() - attempt.startedAt.getTime());
  const updatedAttempt = await tx.paymentAttempt.update({
    where: { id: attempt.id },
    data: {
      status: outcome,
      finishedAt: now,
      durationMs,
      failureCode,
      failureMessage,
      processorReference: outcome === "succeeded" ? `demo_${attempt.id}` : null,
    },
  });
  const updatedPurchase = await tx.purchase.update({
    where: { id: purchase.id },
    data: {
      status: outcome === "succeeded" ? "succeeded" : "failed",
      failureCode,
      failureMessage,
      succeededAt: outcome === "succeeded" ? now : null,
    },
  });
  const session = await tx.funnelSession.findUniqueOrThrow({
    where: { id: purchase.sessionId },
  });
  if (outcome === "succeeded")
    await tx.funnelSession.update({
      where: { id: session.id },
      data: { currentStep: "install", completedAt: now },
    });
  await tx.event.create({
    data: eventData(
      session,
      outcome === "succeeded" ? "purchase_succeeded" : "purchase_failed",
      outcome === "succeeded"
        ? {
            purchaseId: purchase.id,
            planSlug: purchase.planSlug,
            planName: purchase.planName,
            amountMinor: purchase.amountMinor,
            currency: purchase.currency,
          }
        : { purchaseId: purchase.id, failureCode, retryable: true, durationMs },
      "paywall",
    ),
  });
  return result(tx, updatedPurchase, updatedAttempt);
}
async function recover(tx: Prisma.TransactionClient, purchase: Purchase) {
  const processing = await tx.paymentAttempt.findFirst({
    where: { purchaseId: purchase.id, status: "processing" },
  });
  if (
    processing &&
    Date.now() - processing.startedAt.getTime() > STALE_ATTEMPT_MS
  ) {
    await finish(tx, purchase, processing, "timed_out");
    return tx.purchase.findUniqueOrThrow({ where: { id: purchase.id } });
  }
  return purchase;
}
export async function currentPurchase() {
  const session = await activeSession();
  return db.$transaction(async (tx) => {
    await lockSession(tx, session.id);
    let purchase = await tx.purchase.findUnique({
      where: { sessionId: session.id },
    });
    if (!purchase) return null;
    purchase = await recover(tx, purchase);
    return result(
      tx,
      purchase,
      await tx.paymentAttempt.findFirst({
        where: { purchaseId: purchase.id },
        orderBy: { attemptNumber: "desc" },
      }),
    );
  });
}
export async function purchase(input: PurchaseInput) {
  const session = await activeSession();
  const claimAttempt = () =>
    db.$transaction(async (tx) => {
      const current = await lockSession(tx, session.id);
      if (
        !current.userId ||
        !["paywall", "install"].includes(current.currentStep)
      )
        throw new ApiError(
          409,
          "email_required",
          "Save your match with an email before checkout.",
        );
      const prior = await tx.paymentAttempt.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: { purchase: true },
      });
      if (prior) {
        if (prior.purchase.sessionId !== session.id)
          throw new ApiError(
            409,
            "idempotency_conflict",
            "Use a new payment request identifier.",
          );
        const restored = await recover(tx, prior.purchase);
        return {
          response: await result(
            tx,
            restored,
            await tx.paymentAttempt.findUniqueOrThrow({
              where: { id: prior.id },
            }),
          ),
        };
      }
      let existing = await tx.purchase.findUnique({
        where: { sessionId: session.id },
      });
      if (existing) {
        existing = await recover(tx, existing);
        if (existing.status === "succeeded" || existing.status === "processing")
          return {
            response: await result(
              tx,
              existing,
              await tx.paymentAttempt.findFirst({
                where: { purchaseId: existing.id },
                orderBy: { attemptNumber: "desc" },
              }),
            ),
          };
      }
      if (existing && existing.planSlug !== input.planSlug)
        throw new ApiError(
          409,
          "plan_locked",
          "Retry with the plan already selected for this checkout.",
        );
      const safeCard = validateCard(input.card);
      let order: Purchase;
      if (existing) {
        // The reserved offer remains payable even after its live plan is retired.
        order = await tx.purchase.update({
          where: { id: existing.id },
          data: {
            status: "processing",
            failureCode: null,
            failureMessage: null,
          },
        });
      } else {
        const plan = await tx.plan.findFirst({
          where: { slug: input.planSlug, isActive: true },
        });
        if (!plan)
          throw new ApiError(400, "invalid_plan", "Choose an available plan.");
        const snapshot = {
          planId: plan.id,
          planSlug: plan.slug,
          planName: plan.name,
          amountMinor: plan.amountMinor,
          currency: plan.currency,
          billingDescription: plan.billingDescription,
        };
        order = await tx.purchase.create({
          data: {
            ...snapshot,
            sessionId: session.id,
            userId: current.userId,
            status: "processing",
          },
        });
      }
      const count = await tx.paymentAttempt.count({
        where: { purchaseId: order.id },
      });
      const attempt = await tx.paymentAttempt.create({
        data: {
          purchaseId: order.id,
          idempotencyKey: input.idempotencyKey,
          attemptNumber: count + 1,
          status: "processing",
          cardBrand: safeCard.brand,
          cardLast4: safeCard.last4,
        },
      });
      await tx.event.create({
        data: eventData(
          current,
          "purchase_attempted",
          { purchaseId: order.id, attemptNumber: attempt.attemptNumber },
          "paywall",
        ),
      });
      return { order, attempt, safeCard };
    });
  const claim = await claimAttempt().catch(async (error: unknown) => {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const prior = await db.paymentAttempt.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: { purchase: true },
      });
      if (prior) {
        if (prior.purchase.sessionId !== session.id)
          throw new ApiError(
            409,
            "idempotency_conflict",
            "Use a new payment request identifier.",
          );
        // The conflicting transaction committed; reuse its authoritative attempt.
        return claimAttempt();
      }
    }
    throw error;
  });
  if (claim.response) return claim.response;
  let outcome: "succeeded" | "declined" | "timed_out" | "failed";
  try {
    outcome = await processCard(claim.safeCard);
  } catch {
    outcome = "failed";
  }
  return db.$transaction(async (tx) => {
    await lockSession(tx, session.id);
    const attempt = await tx.paymentAttempt.findUniqueOrThrow({
      where: { id: claim.attempt.id },
    });
    const order = await tx.purchase.findUniqueOrThrow({
      where: { id: claim.order.id },
    });
    if (attempt.status !== "processing") return result(tx, order, attempt);
    return finish(tx, order, attempt, outcome);
  });
}
