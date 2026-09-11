"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { funnelScreens, type Plan, type PublicSession, type PurchaseResult } from "@/shared/contracts";
import { APP_STORE_URL, matchSummary, questions } from "@/content/funnel";
import { api, flushEvents, readSafe, saveSafe, track } from "@/hooks/funnel-api";
import { Checkout } from "./Checkout";
import "@/styles/funnel.css";

type Screen = typeof funnelScreens[number];
function availableStep(session: PublicSession) {
  if (session.purchaseStatus === "succeeded") return 8;
  const missing = questions.findIndex(question => !session.answers[question.id]?.length);
  if (missing >= 0) return session.currentStep === "landing" ? 0 : missing + 1;
  return session.email ? 7 : 6;
}
export function Funnel() {
  const [session, setSession] = useState<PublicSession | null>(null);
  const [screen, setScreen] = useState<Screen>("landing");
  const [age, setAge] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const answer = drafts[screen] ?? session?.answers[screen]?.[0] ?? "";
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [booting, setBooting] = useState(true);
  const title = useRef<HTMLHeadingElement>(null);
  const init = useCallback(async () => {
    try {
      const state = await api<PublicSession>("/session", "POST", { landingUrl: window.location.href, referrer: document.referrer || null });
      setSession(state); setEmail(state.email ?? "");
      setDrafts(Object.fromEntries(questions.flatMap(question => {
        const draft = readSafe<unknown>(`chachat:draft:${state.sessionId}:${question.id}`, null);
        return typeof draft === "string" && question.options.some(option => option[0] === draft) ? [[question.id, draft]] : [];
      })));
      const maximum = availableStep(state);
      const requested = funnelScreens.indexOf(window.location.hash.slice(1) as Screen);
      const next = maximum === 8 ? "install" : funnelScreens[requested >= 0 && requested <= maximum ? requested : maximum];
      setScreen(next); setAge(maximum > 0);
    } catch (err) { setError(err instanceof Error ? err.message : "Couldn’t connect. Please try again."); }
    finally { setBooting(false); }
  }, []);
  useEffect(() => {
    // Cancel the first scheduled bootstrap during Strict Mode effect replay.
    const timer = setTimeout(() => void init(), 0);
    return () => clearTimeout(timer);
  }, [init]);
  useEffect(() => {
    if (!session) return;
    const onOnline = () => { void flushEvents(session.sessionId).catch(() => {}); };
    const timer = setInterval(onOnline, 5000);
    window.addEventListener("online", onOnline);
    return () => { clearInterval(timer); window.removeEventListener("online", onOnline); };
  }, [session]);
  useEffect(() => {
    if (!session) return;
    window.history.replaceState(null, "", `#${screen}`);
    void track(session.sessionId, { name: "screen_viewed", screen, stepIndex: funnelScreens.indexOf(screen), properties: {} }).catch(() => {});
    if (screen === "install" && session.purchaseStatus === "succeeded") {
      void api<PurchaseResult | null>("/purchases/current").then(purchase => { if (purchase?.status === "succeeded") return track(session.sessionId, { name: "install_screen_viewed", screen: "install", stepIndex: 8, properties: { purchaseId: purchase.purchaseId } }); }).catch(() => {});
    }
    title.current?.focus();
    // A screen view occurs on navigation, not on each answer update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, session?.sessionId]);
  useEffect(() => {
    if (screen !== "paywall") return;
    api<Plan[]>("/plans").then(setPlans).catch(err => setError(err instanceof Error ? err.message : "Plans could not load."));
  }, [screen]);
  async function advance() {
    if (!session || busy) return;
    setBusy(true); setError("");
    try {
      if (screen === "landing") {
        if (!age) return;
        await track(session.sessionId, { name: "age_confirmed", screen: "landing", stepIndex: 0, properties: { confirmed: true } });
        setScreen("intent");
      } else if (questions.some(question => question.id === screen)) {
        if (!answer) return;
        const updated = await api<PublicSession>(`/quiz/${screen}`, "PUT", { answerIds: [answer] });
        setSession(updated); setScreen(funnelScreens[funnelScreens.indexOf(screen) + 1]);
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Couldn’t save your answer. Try again."); }
    finally { setBusy(false); }
  }
  function back() {
    if (!session || busy) return;
    const to = funnelScreens[Math.max(0, funnelScreens.indexOf(screen) - 1)];
    void track(session.sessionId, { name: "back_clicked", screen, stepIndex: funnelScreens.indexOf(screen), properties: { fromScreen: screen, toScreen: to } }).catch(() => {});
    setError(""); setScreen(to);
  }
  async function submitEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try { const updated = await api<PublicSession>("/identity/email", "POST", { email }); setSession(updated); setEmail(updated.email ?? email); setScreen("paywall"); }
    catch (err) { setError(err instanceof Error ? err.message : "Please check your email and try again."); }
    finally { setBusy(false); }
  }
  function completed(result: PurchaseResult) {
    if (!session || result.status !== "succeeded") return;
    setSession({ ...session, purchaseStatus: "succeeded", currentStep: "install" }); setScreen("install");
  }
  const question = questions.find(item => item.id === screen);
  const summary = matchSummary(session?.answers ?? {});
  return <div className="funnel-shell">
    <header className="site-header"><a className="brand" href="#landing" onClick={event => { event.preventDefault(); if (screen !== "install" && screen !== "paywall") setScreen("landing"); }} aria-label="ChaChat home"><span className="brand-mark" aria-hidden="true">c<span>✦</span></span>ChaChat<span className="brand-dot">.</span></a><span className="header-note">A little curiosity. A new connection.<span className="age-pill">18+</span></span></header>
    <main className={`funnel-main ${screen === "landing" ? "landing-main" : ""}`}>
      {booting ? <div className="loading-state" role="status"><span className="spinner" />Getting your experience ready…</div> : !session ? <div className="connection-error"><h1>Let’s reconnect.</h1><p role="alert">{error}</p><button className="primary" onClick={() => { setBooting(true); setError(""); void init(); }}>Try again →</button></div> : <>
        {screen !== "landing" && screen !== "install" && <div className="progress-header"><button className="back" onClick={back} disabled={busy} aria-label="Go back">←</button><div className="progress-track" aria-label={`Step ${Math.min(funnelScreens.indexOf(screen), 6)} of 6`}><span style={{ width: `${Math.min(funnelScreens.indexOf(screen), 6) / 6 * 100}%` }} /></div><span className="step-label">{screen === "paywall" ? "YOUR MATCH" : `${Math.min(funnelScreens.indexOf(screen), 6)} / 6`}</span></div>}
        {screen === "landing" && <div className="landing-grid"><section className="landing-copy"><div className="eyebrow"><span className="live-dot" /> A WORLD OF CHARACTERS. ONE THAT CLICKS.</div><h1 ref={title} tabIndex={-1}>Meet an AI character made for <em>your kind of conversation.</em></h1><p className="lead">A friend. A co-creator. Your next great story.<br />Discover a connection that starts with you.</p><div className="feature-chips"><span>✦ Unique characters</span><span>♫ Text & voice</span><span>☾ Stories & memory</span></div><label className="age-check"><input type="checkbox" checked={age} onChange={event => setAge(event.target.checked)} />I confirm that I am 18 or older</label><button className="primary landing-cta" disabled={!age || busy} onClick={() => void advance()}>{busy ? "Starting…" : "Find my character"}<span aria-hidden="true">→</span></button><p className="cta-caption">5 questions · About a minute · Made for you</p>{error && <p className="error-box" role="alert">{error}</p>}</section><CharacterArt /></div>}
        {question && <section className="step-card" key={question.id}><p className="eyebrow">{question.eyebrow}</p><h1 ref={title} tabIndex={-1}>{question.title}</h1><p className="lead">{question.description}</p><fieldset className="answer-list"><legend className="sr-only">{question.title}</legend>{question.options.map(([id, label, detail, icon]) => <label className={`answer-option ${answer === id ? "selected" : ""}`} key={id}><input type="radio" name={question.id} value={id} checked={answer === id} onChange={() => { setDrafts(current => ({ ...current, [screen]: id })); saveSafe(`chachat:draft:${session.sessionId}:${screen}`, id); }} /><span className="option-icon" aria-hidden="true">{icon}</span><span className="option-copy"><strong>{label}</strong><small>{detail}</small></span><span className="radio-art" aria-hidden="true">{answer === id ? "✓" : ""}</span></label>)}</fieldset>{error && <p className="error-box" role="alert">{error}</p>}<button className="primary" disabled={!answer || busy} onClick={() => void advance()}>{busy ? "Saving…" : "Continue"}<span aria-hidden="true">→</span></button><p className="fine-print">Your answers help shape your recommendation.</p></section>}
        {screen === "email" && <section className="step-card email-card"><div className="match-orb" aria-hidden="true">✦</div><p className="eyebrow">A LITTLE MORE YOU</p><h1 ref={title} tabIndex={-1}>{summary.title}</h1><p className="lead">{summary.description}</p><div className="match-note"><span>✦</span><p>Your character match is ready.<br /><strong>Save your result and discover your plan.</strong></p></div><form onSubmit={submitEmail}><label className="email-label">Your email address<input type="email" name="email" autoComplete="email" placeholder="you@example.com" required maxLength={320} value={email} onChange={event => setEmail(event.target.value)} /></label>{error && <p className="error-box" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy ? "Saving your match…" : "Reveal my offer"}<span aria-hidden="true">→</span></button><p className="fine-print">Your email connects this result to your demo purchase.<br />We won’t send email from this demo.</p></form></section>}
        {screen === "paywall" && <section className="step-card paywall-card"><p className="eyebrow">YOUR NEXT CONVERSATION STARTS HERE</p><h1 ref={title} tabIndex={-1}>Make room for<br /><em>a little possibility.</em></h1><p className="lead">{summary.description}</p><ul className="benefits"><li>✦ Discover and create AI characters</li><li>♫ Explore text, voice, and interactive stories</li><li>♡ Build conversations with remembered context</li></ul>{error && <div className="error-box" role="alert">{error}<button onClick={() => { setError(""); void api<Plan[]>("/plans").then(setPlans).catch(() => setError("Plans could not load. Please try again.")); }}>Retry loading plans</button></div>}{plans.length ? <Checkout sessionId={session.sessionId} plans={plans} onSuccess={completed} /> : <p role="status">Loading your plans…</p>}</section>}
        {screen === "install" && session.purchaseStatus === "succeeded" && <section className="step-card install-card"><div className="success-orb" aria-hidden="true">✓</div><p className="eyebrow">YOUR DEMO PURCHASE IS COMPLETE</p><h1 ref={title} tabIndex={-1}>Say hello to<br /><em>your next chapter.</em></h1><p className="lead">Your demo purchase is confirmed for<br /><strong className="resolved-email">{session.email}</strong></p><p>Download ChaChat on your iPhone to explore AI characters, conversations, and new stories.</p><a className="primary app-store" href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" onClick={() => { void track(session.sessionId, { name: "install_link_clicked", screen: "install", stepIndex: 8, properties: { destination: APP_STORE_URL } }).catch(() => {}); }}><span>Download on the App Store</span><span aria-hidden="true">↗</span></a><p className="fine-print">For iPhone · Ages 18+<br />This demo purchase does not grant a paid subscription in the app.</p></section>}
      </>}
    </main><footer className="site-footer"><span>Made for your imagination.</span><span>AI characters. Real curiosity.<span className="footer-spark">✦</span></span></footer>
  </div>;
}
function CharacterArt() {
  return <div className="character-scene" aria-label="Illustrated character conversation preview"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><span className="scene-star star-one">✦</span><span className="scene-star star-two">✧</span><div className="character-card back-card"><div className="mini-landscape"><span>☾</span></div><span>Explore another world</span></div><div className="character-card front-card"><div className="portrait"><svg viewBox="0 0 320 340" role="img" aria-label="Illustrated AI character with purple hair"><defs><linearGradient id="portrait-bg" x2="1" y2="1"><stop stopColor="#d6ccff" /><stop offset="1" stopColor="#8a65ca" /></linearGradient><linearGradient id="hair" x2="1" y2="1"><stop stopColor="#45316d" /><stop offset="1" stopColor="#251735" /></linearGradient></defs><rect width="320" height="340" fill="url(#portrait-bg)" /><circle cx="243" cy="80" r="75" fill="#f1dbed" opacity=".35" /><path d="M40 340Q44 234 104 227L212 227Q282 243 287 340" fill="#4d405f" /><path d="M72 261Q34 131 81 61Q113 17 183 36Q268 32 259 154L241 275L182 251L109 270" fill="url(#hair)" /><path d="M133 208L130 250Q164 275 193 247L185 201" fill="#d79991" /><ellipse cx="163" cy="142" rx="66" ry="86" fill="#eeb9aa" /><path d="M94 143Q68 57 130 47Q200 21 235 85L239 159Q202 140 183 82Q146 129 94 143" fill="url(#hair)" /><path d="M114 146Q126 136 141 146M182 145Q197 134 211 143" fill="none" stroke="#513949" strokeWidth="4" strokeLinecap="round" /><ellipse cx="130" cy="153" rx="5" ry="7" fill="#4c394a" /><ellipse cx="196" cy="151" rx="5" ry="7" fill="#4c394a" /><path d="M165 152L158 176L166 179M145 193Q164 205 181 190" fill="none" stroke="#b16e70" strokeWidth="3" strokeLinecap="round" /><circle cx="117" cy="177" r="11" fill="#e89c9a" opacity=".5" /><circle cx="203" cy="175" r="11" fill="#e89c9a" opacity=".5" /><path d="M112 250L154 292L193 247L228 273L211 340L99 340L89 274" fill="#b5a3d0" /><path d="M152 292L169 307L186 286" fill="none" stroke="#807096" strokeWidth="3" /><circle cx="167" cy="316" r="4" fill="#e7d9f6" /></svg><span className="character-label"><span className="live-dot" /> YOUR NEXT CONNECTION</span></div><div className="card-caption"><strong>A conversation. A possibility.</strong><span>Always something new to discover.</span></div></div><div className="chat-bubble"><span className="bubble-spark">✦</span><p>Hey, you. Where should<br />our story begin?</p></div><div className="floating-tag">✧ A little more your world</div></div>;
}
