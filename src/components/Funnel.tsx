"use client";

import { useEffect, useRef } from "react";
import { funnelScreens } from "@/shared/contracts";
import { APP_STORE_URL, copy, matchSummary, questions } from "@/content/funnel";
import { track } from "@/hooks/funnel-api";
import { useFunnel } from "@/hooks/use-funnel";
import { Checkout } from "./Checkout";
import {
  EmailScreen,
  InstallScreen,
  LandingScreen,
  PaywallScreen,
  QuestionScreen,
} from "./FunnelScreens";
import "@/styles/funnel.css";

export function Funnel() {
  const funnel = useFunnel();
  const title = useRef<HTMLHeadingElement>(null);
  const { session, screen } = funnel;
  const question = questions.find((item) => item.id === screen);
  const summary = matchSummary(session?.answers ?? {});
  const steps = questions.length + 1;
  const step = Math.min(funnelScreens.indexOf(screen), steps);
  useEffect(() => {
    title.current?.focus();
  }, [screen, funnel.booting]);
  return (
    <div className="funnel-shell">
      <header className="site-header">
        <a
          className="brand"
          href="#landing"
          onClick={(event) => {
            event.preventDefault();
            funnel.home();
          }}
          aria-label={copy.brandLabel}
        >
          <span className="brand-mark" aria-hidden="true">
            c<span>✦</span>
          </span>
          {copy.brand}
          <span className="brand-dot">.</span>
        </a>
        <span className="header-note">
          {copy.headerNote}
          <span className="age-pill">{copy.ageBadge}</span>
        </span>
      </header>
      <main
        className={`funnel-main ${screen === "landing" ? "landing-main" : ""}`}
      >
        {funnel.booting ? (
          <div className="loading-state" role="status">
            <span className="spinner" />
            {copy.loading}
          </div>
        ) : !session ? (
          <div className="connection-error">
            <h1>{copy.reconnectTitle}</h1>
            <p role="alert">{funnel.error}</p>
            <button className="primary" onClick={() => void funnel.retry()}>
              {copy.retry} →
            </button>
          </div>
        ) : (
          <>
            {screen !== "landing" && screen !== "install" && (
              <div className="progress-header">
                <button
                  className="back"
                  onClick={funnel.back}
                  disabled={funnel.busy}
                  aria-label={copy.back}
                >
                  ←
                </button>
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-label={copy.step(step, steps)}
                  aria-valuemin={0}
                  aria-valuemax={steps}
                  aria-valuenow={step}
                >
                  <span style={{ width: `${(step / steps) * 100}%` }} />
                </div>
                <span className="step-label">
                  {screen === "paywall" ? copy.yourMatch : `${step} / ${steps}`}
                </span>
              </div>
            )}
            {screen === "landing" && (
              <LandingScreen
                titleRef={title}
                age={funnel.age}
                setAge={funnel.setAge}
                busy={funnel.busy}
                error={funnel.error}
                onContinue={() => void funnel.advance()}
              />
            )}
            {question && (
              <QuestionScreen
                key={question.id}
                titleRef={title}
                question={question}
                answer={funnel.answer}
                choose={funnel.chooseAnswer}
                busy={funnel.busy}
                error={funnel.error}
                onContinue={() => void funnel.advance()}
              />
            )}
            {screen === "email" && (
              <EmailScreen
                titleRef={title}
                summary={summary}
                email={funnel.email}
                setEmail={funnel.setEmail}
                busy={funnel.busy}
                error={funnel.error}
                onSubmit={(event) => void funnel.submitEmail(event)}
              />
            )}
            {screen === "paywall" && (
              <PaywallScreen titleRef={title} description={summary.description}>
                <Checkout
                  key={session.sessionId}
                  sessionId={session.sessionId}
                  onSuccess={funnel.completed}
                />
              </PaywallScreen>
            )}
            {screen === "install" &&
              funnel.purchase?.status === "succeeded" && (
                <InstallScreen
                  titleRef={title}
                  email={funnel.purchase.email}
                  onInstall={() => {
                    void track(session.sessionId, {
                      name: "install_link_clicked",
                      screen: "install",
                      stepIndex: funnelScreens.indexOf("install"),
                      properties: { destination: APP_STORE_URL },
                    }).catch(() => {});
                  }}
                />
              )}
          </>
        )}
      </main>
      <footer className="site-footer">
        <span>{copy.footer[0]}</span>
        <span>
          {copy.footer[1]}
          <span className="footer-spark" aria-hidden="true">
            ✦
          </span>
        </span>
      </footer>
    </div>
  );
}
