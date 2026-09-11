import { z } from "zod";

export const FUNNEL_VERSION = "character-match-v1";

export const funnelScreens = [
  "landing",
  "intent",
  "character_type",
  "interaction_mode",
  "memory",
  "usage_moment",
  "email",
  "paywall",
  "install",
] as const;

export const questionIds = [
  "intent",
  "character_type",
  "interaction_mode",
  "memory",
  "usage_moment",
] as const;

export const eventNames = [
  "session_started",
  "screen_viewed",
  "age_confirmed",
  "quiz_answered",
  "back_clicked",
  "email_submitted",
  "identity_resolved",
  "plan_selected",
  "payment_submitted",
  "purchase_attempted",
  "purchase_succeeded",
  "purchase_failed",
  "install_screen_viewed",
  "install_link_clicked",
] as const;

export const funnelScreenSchema = z.enum(funnelScreens);
export const questionIdSchema = z.enum(questionIds);
export const eventNameSchema = z.enum(eventNames);

export const publicSessionSchema = z.object({
  sessionId: z.string().uuid(),
  currentStep: funnelScreenSchema,
  email: z.string().email().nullable(),
  answers: z.record(z.string(), z.array(z.string())),
  purchaseStatus: z.enum(["created", "processing", "succeeded", "failed"]).nullable(),
});

export const clientEventInputSchema = z.object({
  clientEventId: z.string().uuid(),
  name: eventNameSchema.exclude([
    "session_started",
    "quiz_answered",
    "email_submitted",
    "identity_resolved",
    "purchase_attempted",
    "purchase_succeeded",
    "purchase_failed",
  ]),
  screen: funnelScreenSchema.optional(),
  stepIndex: z.number().int().min(0).max(funnelScreens.length - 1).optional(),
  occurredAt: z.string().datetime(),
  properties: z.record(z.string(), z.unknown()).default({}),
});

export const quizAnswerInputSchema = z.object({
  answerIds: z.array(z.string().min(1).max(64)).min(1).max(4),
});

export const emailInputSchema = z.object({
  email: z.string().trim().email().max(320),
});

export const planSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  amountMinor: z.number().int().positive(),
  currency: z.string().length(3),
  billingDescription: z.string(),
  isDefault: z.boolean(),
});

export const purchaseInputSchema = z.object({
  planSlug: z.string().min(1).max(64),
  idempotencyKey: z.string().uuid(),
  card: z.object({
    number: z.string().min(12).max(23),
    expiry: z.string().min(4).max(7),
    cvc: z.string().min(3).max(4),
    cardholderName: z.string().trim().min(2).max(120),
    country: z.string().length(2),
    postalCode: z.string().trim().min(2).max(16),
  }),
});

export const purchaseResultSchema = z.object({
  purchaseId: z.string().uuid(),
  planSlug: z.string(),
  planName: z.string(),
  amountMinor: z.number().int().positive(),
  currency: z.string().length(3),
  billingDescription: z.string(),
  status: z.enum(["processing", "succeeded", "failed"]),
  attemptNumber: z.number().int().positive().nullable(),
  failureCode: z.string().nullable(),
  message: z.string().nullable(),
});

export type PublicSession = z.infer<typeof publicSessionSchema>;
export type ClientEventInput = z.infer<typeof clientEventInputSchema>;
export type QuizAnswerInput = z.infer<typeof quizAnswerInputSchema>;
export type EmailInput = z.infer<typeof emailInputSchema>;
export type Plan = z.infer<typeof planSchema>;
export type PurchaseInput = z.infer<typeof purchaseInputSchema>;
export type PurchaseResult = z.infer<typeof purchaseResultSchema>;

export type ApiSuccess<T> = { data: T };
export type ApiFailure = {
  error: {
    code: string;
    message: string;
    fieldErrors?: Record<string, string[]>;
  };
};
