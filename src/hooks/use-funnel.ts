"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  funnelScreens,
  publicSessionSchema,
  purchaseResultSchema,
  type PublicSession,
  type PurchaseResult,
} from "@/shared/contracts";
import { copy, questions } from "@/content/funnel";
import {
  api,
  flushEvents,
  readSafe,
  readTab,
  saveSafe,
  saveTab,
  track,
} from "./funnel-api";
import { bootstrapSession } from "./session-bootstrap";

type Screen = (typeof funnelScreens)[number];
export function availableStep(session: PublicSession) {
  if (session.purchaseStatus === "succeeded")
    return funnelScreens.indexOf("install");
  const missing = questions.findIndex(
    (question) => !session.answers[question.id]?.length,
  );
  if (missing >= 0) return session.currentStep === "landing" ? 0 : missing + 1;
  return session.email
    ? funnelScreens.indexOf("paywall")
    : funnelScreens.indexOf("email");
}
function guardedScreen(requested: string, session: PublicSession): Screen {
  const maximum = availableStep(session);
  if (session.purchaseStatus === "succeeded") return "install";
  const index = funnelScreens.indexOf(requested as Screen);
  return funnelScreens[index >= 0 && index <= maximum ? index : maximum];
}
export function useFunnel() {
  const [session, setSession] = useState<PublicSession | null>(null);
  const sessionRef = useRef<PublicSession | null>(null);
  const [screen, setScreen] = useState<Screen>("landing");
  const screenRef = useRef<Screen>("landing");
  const [age, setAge] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [email, setEmail] = useState("");
  const [purchase, setPurchase] = useState<PurchaseResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);
  const [booting, setBooting] = useState(true);
  const installEvent = useRef<string | null>(null);
  const updateSession = useCallback((next: PublicSession) => {
    sessionRef.current = next;
    setSession(next);
  }, []);
  const navigate = useCallback(
    (requested: Screen, replace = false, state = sessionRef.current) => {
      if (!state) return;
      const next = guardedScreen(requested, state);
      const previous = screenRef.current;
      const depth = replace
        ? (window.history.state?.chachat?.depth ?? 0)
        : (window.history.state?.chachat?.depth ?? 0) + 1;
      if (replace || next !== previous)
        window.history[replace ? "replaceState" : "pushState"](
          { chachat: { sessionId: state.sessionId, screen: next, depth } },
          "",
          `#${next}`,
        );
      screenRef.current = next;
      setScreen(next);
      setError("");
    },
    [],
  );
  const init = useCallback(async () => {
    setBooting(true);
    setError("");
    try {
      const state = await bootstrapSession();
      const confirmed =
        state.purchaseStatus === "succeeded"
          ? await api("/purchases/current", purchaseResultSchema.nullable(), {
              sessionId: state.sessionId,
            })
          : null;
      if (
        state.purchaseStatus === "succeeded" &&
        confirmed?.status !== "succeeded"
      )
        throw new Error(copy.errors.request);
      updateSession(state);
      setEmail(confirmed?.email ?? state.email ?? "");
      setPurchase(confirmed);
      setDrafts(
        Object.fromEntries(
          questions.flatMap((question) => {
            const draft = readSafe<unknown>(
              `chachat:draft:${state.sessionId}:${question.id}`,
              null,
            );
            return typeof draft === "string" &&
              question.options.some((option) => option[0] === draft)
              ? [[question.id, draft]]
              : [];
          }),
        ),
      );
      setAge(availableStep(state) > 0);
      navigate(
        guardedScreen(window.location.hash.slice(1), state),
        true,
        state,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.errors.connect);
    } finally {
      setBooting(false);
    }
  }, [navigate, updateSession]);
  useEffect(() => {
    const timer = setTimeout(() => void init(), 0);
    return () => clearTimeout(timer);
  }, [init]);
  const sessionId = session?.sessionId;
  useEffect(() => {
    if (!sessionId) return;
    const flush = () => {
      void flushEvents(sessionId).catch(() => {});
    };
    const timer = setInterval(flush, 5000);
    window.addEventListener("online", flush);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", flush);
    };
  }, [sessionId]);
  useEffect(() => {
    const historyChanged = () => {
      const state = sessionRef.current;
      if (!state) return;
      const previous = screenRef.current;
      const next = guardedScreen(window.location.hash.slice(1), state);
      if (window.location.hash !== `#${next}`)
        window.history.replaceState(
          {
            chachat: {
              sessionId: state.sessionId,
              screen: next,
              depth: window.history.state?.chachat?.depth ?? 0,
            },
          },
          "",
          `#${next}`,
        );
      if (
        previous !== next &&
        funnelScreens.indexOf(next) < funnelScreens.indexOf(previous)
      )
        void track(state.sessionId, {
          name: "back_clicked",
          screen: previous,
          stepIndex: funnelScreens.indexOf(previous),
          properties: { fromScreen: previous, toScreen: next },
        }).catch(() => {});
      screenRef.current = next;
      setScreen(next);
      setError("");
    };
    window.addEventListener("popstate", historyChanged);
    window.addEventListener("hashchange", historyChanged);
    return () => {
      window.removeEventListener("popstate", historyChanged);
      window.removeEventListener("hashchange", historyChanged);
    };
  }, []);
  useEffect(() => {
    if (!sessionId) return;
    void track(sessionId, {
      name: "screen_viewed",
      screen,
      stepIndex: funnelScreens.indexOf(screen),
      properties: {},
    }).catch(() => {});
  }, [screen, sessionId]);
  useEffect(() => {
    if (
      !sessionId ||
      screen !== "install" ||
      purchase?.status !== "succeeded" ||
      installEvent.current === purchase.purchaseId
    )
      return;
    installEvent.current = purchase.purchaseId;
    void track(sessionId, {
      name: "install_screen_viewed",
      screen: "install",
      stepIndex: funnelScreens.indexOf("install"),
      properties: { purchaseId: purchase.purchaseId },
    }).catch(() => {});
  }, [purchase, screen, sessionId]);
  const answer = drafts[screen] ?? session?.answers[screen]?.[0] ?? "";
  function chooseAnswer(value: string) {
    if (!session) return;
    setDrafts((current) => ({ ...current, [screen]: value }));
    saveSafe(`chachat:draft:${session.sessionId}:${screen}`, value);
  }
  async function advance() {
    if (!session || actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    try {
      if (screen === "landing") {
        if (!age) return;
        const key = `chachat:age:${session.sessionId}`;
        const clientEventId =
          readTab(key, z.string().uuid()) ?? crypto.randomUUID();
        saveTab(key, clientEventId);
        const updated = await api("/session/age", publicSessionSchema, {
          method: "POST",
          body: { clientEventId },
          sessionId: session.sessionId,
        });
        updateSession(updated);
        navigate("intent", false, updated);
      } else if (questions.some((question) => question.id === screen)) {
        if (!answer) return;
        const updated = await api(`/quiz/${screen}`, publicSessionSchema, {
          method: "PUT",
          body: { answerIds: [answer] },
          sessionId: session.sessionId,
        });
        updateSession(updated);
        navigate(
          funnelScreens[funnelScreens.indexOf(screen) + 1],
          false,
          updated,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.errors.saveAnswer);
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }
  function back() {
    if (!session || actionLock.current) return;
    if ((window.history.state?.chachat?.depth ?? 0) > 0) {
      window.history.back();
      return;
    }
    const to = funnelScreens[Math.max(0, funnelScreens.indexOf(screen) - 1)];
    void track(session.sessionId, {
      name: "back_clicked",
      screen,
      stepIndex: funnelScreens.indexOf(screen),
      properties: { fromScreen: screen, toScreen: to },
    }).catch(() => {});
    navigate(to, true);
  }
  async function submitEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    try {
      const updated = await api("/identity/email", publicSessionSchema, {
        method: "POST",
        body: { email },
        sessionId: session.sessionId,
      });
      updateSession(updated);
      setEmail(updated.email ?? email);
      navigate("paywall", false, updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.errors.email);
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }
  const completed = useCallback(
    (result: PurchaseResult) => {
      const current = sessionRef.current;
      if (!current || result.status !== "succeeded") return;
      const updated: PublicSession = {
        ...current,
        email: result.email,
        purchaseStatus: "succeeded",
        currentStep: "install",
      };
      updateSession(updated);
      setEmail(result.email);
      setPurchase(result);
      navigate("install", true, updated);
    },
    [navigate, updateSession],
  );
  return {
    session,
    screen,
    age,
    setAge,
    answer,
    chooseAnswer,
    email,
    setEmail,
    purchase,
    error,
    busy,
    booting,
    retry: init,
    advance,
    back,
    submitEmail,
    completed,
    home: () => {
      if (!actionLock.current && screen !== "install" && screen !== "paywall")
        navigate("landing");
    },
  };
}
