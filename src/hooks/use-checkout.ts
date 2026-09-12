"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  planSchema,
  purchaseResultSchema,
  type Plan,
  type PurchaseInput,
  type PurchaseResult,
} from "@/shared/contracts";
import { copy } from "@/content/funnel";
import {
  api,
  ApiError,
  readTab,
  saveTab,
  stableEventId,
  track,
} from "./funnel-api";

type Phase = "recovering" | "ready" | "submitting" | "processing" | "uncertain";
type CheckoutState = {
  phase: Phase;
  purchase: PurchaseResult | null;
  message: string;
  fields: Record<string, string[]>;
};
const uuidSchema = z.string().uuid();
const pendingPlanSchema = z.object({
  idempotencyKey: uuidSchema,
  planSlug: z.string().min(1).max(64),
});
export function canApplyPurchase(
  current: PurchaseResult | null,
  incoming: PurchaseResult | null,
): boolean {
  if (!current) return true;
  if (!incoming || incoming.purchaseId !== current.purchaseId) return false;
  if (current.status === "succeeded") return incoming.status === "succeeded";
  const currentAttempt = current.attemptNumber ?? 0;
  const incomingAttempt = incoming.attemptNumber ?? 0;
  if (incomingAttempt < currentAttempt) return false;
  return !(
    incomingAttempt === currentAttempt &&
    current.status === "failed" &&
    incoming.status === "processing"
  );
}
export function useCheckout(
  sessionId: string,
  onSuccess: (purchase: PurchaseResult) => void,
) {
  const key = `chachat:attempt:${sessionId}`;
  const metadataKey = `chachat:attempt-plan:${sessionId}`;
  const [pendingPlan, setPendingPlan] = useState(() => {
    const metadata = readTab(metadataKey, pendingPlanSchema);
    return metadata?.idempotencyKey === readTab(key, uuidSchema)
      ? metadata
      : null;
  });
  const pendingPlanRef = useRef(pendingPlan);
  const [state, setState] = useState<CheckoutState>({
    phase: "recovering",
    purchase: null,
    message: "",
    fields: {},
  });
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [planError, setPlanError] = useState("");
  const [slug, setSlug] = useState(pendingPlan?.planSlug ?? "");
  const generation = useRef(0);
  const requestNumber = useRef(0);
  const appliedRequest = useRef(0);
  const submitting = useRef(false);
  const latestPurchase = useRef<PurchaseResult | null>(null);
  const mounted = useRef(false);
  const success = useRef(onSuccess);
  const defaultQueued = useRef(pendingPlan !== null);
  const clearPending = useCallback(
    (idempotencyKey: string) => {
      if (readTab(key, uuidSchema) !== idempotencyKey) return;
      saveTab(key, null);
      if (
        readTab(metadataKey, pendingPlanSchema)?.idempotencyKey ===
        idempotencyKey
      )
        saveTab(metadataKey, null);
      if (pendingPlanRef.current?.idempotencyKey === idempotencyKey) {
        pendingPlanRef.current = null;
        setPendingPlan(null);
      }
    },
    [key, metadataKey],
  );
  const invalidateRequests = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    success.current = onSuccess;
  }, [onSuccess]);
  const apply = useCallback(
    (
      purchase: PurchaseResult | null,
      requestGeneration: number,
      number: number,
    ) => {
      if (
        !mounted.current ||
        requestGeneration !== generation.current ||
        number < appliedRequest.current ||
        !canApplyPurchase(latestPurchase.current, purchase)
      )
        return false;
      appliedRequest.current = number;
      const previous = latestPurchase.current;
      const outcomeChanged =
        previous?.attemptId !== purchase?.attemptId ||
        previous?.status !== purchase?.status;
      latestPurchase.current = purchase;
      if (purchase?.status !== "processing" && purchase?.idempotencyKey)
        clearPending(purchase.idempotencyKey);
      if (purchase) setSlug(purchase.planSlug);
      else if (pendingPlanRef.current) setSlug(pendingPlanRef.current.planSlug);
      setState((current) => ({
        phase:
          purchase?.status === "processing"
            ? "processing"
            : !purchase && pendingPlanRef.current
              ? "uncertain"
              : "ready",
        purchase,
        message:
          !outcomeChanged && current.phase === "ready"
            ? current.message
            : purchase?.status === "failed"
              ? (purchase.message ?? copy.checkout.failed)
              : !purchase && pendingPlanRef.current
                ? copy.checkout.interrupted
                : "",
        fields: outcomeChanged ? {} : current.fields,
      }));
      if (purchase?.status === "succeeded") success.current(purchase);
      return true;
    },
    [clearPending],
  );
  const loadPlans = useCallback(async () => {
    setPlanError("");
    try {
      const available = await api("/plans", z.array(planSchema));
      if (mounted.current) setPlans(available);
    } catch (error) {
      if (mounted.current)
        setPlanError(
          error instanceof Error ? error.message : copy.errors.plans,
        );
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    const recover = async () => {
      if (!active) return;
      if (submitting.current) {
        timer = setTimeout(() => void recover(), 2500);
        return;
      }
      const epoch = generation.current;
      const number = ++requestNumber.current;
      try {
        const current = await api(
          "/purchases/current",
          purchaseResultSchema.nullable(),
          { sessionId },
        );
        if (active) apply(current, epoch, number);
      } catch (error) {
        if (
          active &&
          epoch === generation.current &&
          number >= appliedRequest.current
        )
          setState((current) => ({
            ...current,
            phase:
              current.purchase?.status === "processing"
                ? "processing"
                : "uncertain",
            message:
              error instanceof ApiError &&
              ["session_changed", "session_required"].includes(error.code)
                ? copy.errors.sessionChanged
                : copy.checkout.reconnecting,
          }));
      } finally {
        if (active) timer = setTimeout(() => void recover(), 2500);
      }
    };
    void loadPlans();
    void recover();
    return () => {
      active = false;
      mounted.current = false;
      invalidateRequests();
      if (timer) clearTimeout(timer);
    };
  }, [apply, invalidateRequests, loadPlans, sessionId]);
  useEffect(() => {
    if (
      !plans ||
      state.phase === "recovering" ||
      state.phase === "uncertain" ||
      state.purchase ||
      pendingPlan ||
      defaultQueued.current
    )
      return;
    const initial = plans.find((plan) => plan.isDefault) ?? plans[0];
    if (!initial) return;
    defaultQueued.current = true;
    void stableEventId(sessionId, "default-plan")
      .then((id) => {
        if (!mounted.current || latestPurchase.current) return;
        void track(
          sessionId,
          {
            name: "plan_selected",
            screen: "paywall",
            stepIndex: 7,
            properties: { planSlug: initial.slug, source: "default" },
          },
          id,
        ).catch(() => {});
        setSlug(initial.slug);
      })
      .catch(() => {
        if (mounted.current) {
          defaultQueued.current = false;
          setPlanError(copy.errors.request);
        }
      });
  }, [pendingPlan, plans, sessionId, state.phase, state.purchase]);
  function selectPlan(next: string) {
    if (state.purchase || state.phase !== "ready" || pendingPlanRef.current)
      return;
    setSlug(next);
    void track(sessionId, {
      name: "plan_selected",
      screen: "paywall",
      stepIndex: 7,
      properties: { planSlug: next, source: "manual" },
    }).catch(() => {});
  }
  async function submit(card: PurchaseInput["card"]): Promise<boolean> {
    if (
      submitting.current ||
      !slug ||
      state.phase === "recovering" ||
      latestPurchase.current?.status === "processing" ||
      latestPurchase.current?.status === "succeeded"
    )
      return false;
    submitting.current = true;
    const epoch = ++generation.current;
    const number = ++requestNumber.current;
    const idempotencyKey = readTab(key, uuidSchema) ?? crypto.randomUUID();
    const planSlug =
      latestPurchase.current?.planSlug ??
      pendingPlanRef.current?.planSlug ??
      slug;
    const metadata = { idempotencyKey, planSlug };
    saveTab(metadataKey, metadata);
    saveTab(key, idempotencyKey);
    pendingPlanRef.current = metadata;
    setPendingPlan(metadata);
    setState((current) => ({
      ...current,
      phase: "submitting",
      message: "",
      fields: {},
    }));
    void track(sessionId, {
      name: "payment_submitted",
      screen: "paywall",
      stepIndex: 7,
      properties: { planSlug },
    }).catch(() => {});
    try {
      const purchase = await api("/purchases", purchaseResultSchema, {
        method: "POST",
        body: { planSlug, idempotencyKey, card },
        sessionId,
      });
      apply(purchase, epoch, number);
      return purchase.status === "succeeded";
    } catch (error) {
      if (!mounted.current || epoch !== generation.current) return false;
      const rejectedBeforeAttempt =
        error instanceof ApiError &&
        error.status === 400 &&
        [
          "validation_error",
          "invalid_card",
          "invalid_expiry",
          "invalid_cvc",
          "invalid_plan",
        ].includes(error.code);
      if (rejectedBeforeAttempt) clearPending(idempotencyKey);
      setState((current) => ({
        ...current,
        phase:
          error instanceof ApiError &&
          error.status < 500 &&
          error.code !== "invalid_response"
            ? "ready"
            : "uncertain",
        message:
          error instanceof ApiError ? error.message : copy.checkout.interrupted,
        fields: error instanceof ApiError ? (error.fields ?? {}) : {},
      }));
      return false;
    } finally {
      submitting.current = false;
    }
  }
  const purchase = state.purchase;
  const snapshot: Plan | null = purchase
    ? {
        id: purchase.planId,
        slug: purchase.planSlug,
        name: purchase.planName,
        amountMinor: purchase.amountMinor,
        currency: purchase.currency,
        billingDescription: purchase.billingDescription,
        isDefault: false,
      }
    : null;
  const displayedPlans = (plans ?? []).map((plan) =>
    snapshot?.slug === plan.slug
      ? { ...snapshot, isDefault: plan.isDefault }
      : plan,
  );
  if (snapshot && !displayedPlans.some((plan) => plan.slug === snapshot.slug))
    displayedPlans.push(snapshot);
  const selected = displayedPlans.find((plan) => plan.slug === slug);
  return {
    ...state,
    plans: displayedPlans,
    plansLoading: plans === null && !planError,
    planError,
    reloadPlans: loadPlans,
    slug,
    selected,
    planLocked: pendingPlan !== null,
    selectPlan,
    submit,
    pending: ["recovering", "submitting", "processing"].includes(state.phase),
  };
}
