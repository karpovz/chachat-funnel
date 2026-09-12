import type { Ref } from "react";
import { APP_STORE_URL, copy, type questions } from "@/content/funnel";
import { CharacterArt } from "./CharacterArt";

type Title = { titleRef: Ref<HTMLHeadingElement> };
export function LandingScreen({
  titleRef,
  age,
  setAge,
  busy,
  error,
  onContinue,
}: Title & {
  age: boolean;
  setAge: (value: boolean) => void;
  busy: boolean;
  error: string;
  onContinue: () => void;
}) {
  return (
    <div className="landing-grid">
      <section className="landing-copy">
        <div className="eyebrow">
          <span className="live-dot" />
          {copy.landing.eyebrow}
        </div>
        <h1 ref={titleRef} tabIndex={-1}>
          {copy.landing.title} <em>{copy.landing.emphasis}</em>
        </h1>
        <p className="lead">
          {copy.landing.lead}
          <br />
          {copy.landing.detail}
        </p>
        <div className="feature-chips">
          {copy.landing.features.map((feature) => (
            <span key={feature}>{feature}</span>
          ))}
        </div>
        <label className="age-check">
          <input
            type="checkbox"
            checked={age}
            onChange={(event) => setAge(event.target.checked)}
          />
          {copy.landing.age}
        </label>
        <button
          className="primary landing-cta"
          disabled={!age || busy}
          onClick={onContinue}
        >
          {busy ? copy.landing.starting : copy.landing.start}
          <span aria-hidden="true">→</span>
        </button>
        <p className="cta-caption">{copy.landing.caption}</p>
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
      </section>
      <CharacterArt />
    </div>
  );
}
export function QuestionScreen({
  titleRef,
  question,
  answer,
  choose,
  busy,
  error,
  onContinue,
}: Title & {
  question: (typeof questions)[number];
  answer: string;
  choose: (answer: string) => void;
  busy: boolean;
  error: string;
  onContinue: () => void;
}) {
  return (
    <section className="step-card" key={question.id}>
      <p className="eyebrow">{question.eyebrow}</p>
      <h1 ref={titleRef} tabIndex={-1}>
        {question.title}
      </h1>
      <p className="lead">{question.description}</p>
      <fieldset className="answer-list" disabled={busy}>
        <legend className="sr-only">{question.title}</legend>
        {question.options.map(([id, label, detail, icon]) => (
          <label
            className={`answer-option ${answer === id ? "selected" : ""}`}
            key={id}
          >
            <input
              type="radio"
              name={question.id}
              value={id}
              checked={answer === id}
              onChange={() => choose(id)}
            />
            <span className="option-icon" aria-hidden="true">
              {icon}
            </span>
            <span className="option-copy">
              <strong>{label}</strong>
              <small>{detail}</small>
            </span>
            <span className="radio-art" aria-hidden="true">
              {answer === id ? "✓" : ""}
            </span>
          </label>
        ))}
      </fieldset>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <button
        className="primary"
        disabled={!answer || busy}
        onClick={onContinue}
      >
        {busy ? copy.quiz.saving : copy.quiz.continue}
        <span aria-hidden="true">→</span>
      </button>
      <p className="fine-print">{copy.quiz.note}</p>
    </section>
  );
}
export function EmailScreen({
  titleRef,
  summary,
  email,
  setEmail,
  busy,
  error,
  onSubmit,
}: Title & {
  summary: { title: string; description: string };
  email: string;
  setEmail: (value: string) => void;
  busy: boolean;
  error: string;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="step-card email-card">
      <div className="match-orb" aria-hidden="true">
        ✦
      </div>
      <p className="eyebrow">{copy.email.eyebrow}</p>
      <h1 ref={titleRef} tabIndex={-1}>
        {summary.title}
      </h1>
      <p className="lead">{summary.description}</p>
      <div className="match-note">
        <span aria-hidden="true">✦</span>
        <p>
          {copy.email.matchReady}
          <br />
          <strong>{copy.email.save}</strong>
        </p>
      </div>
      <form onSubmit={onSubmit}>
        <label className="email-label">
          {copy.email.label}
          <input
            type="email"
            name="email"
            autoComplete="email"
            placeholder={copy.email.placeholder}
            required
            maxLength={320}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? "email-error" : undefined}
          />
        </label>
        {error && (
          <p className="error-box" id="email-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? copy.email.saving : copy.email.reveal}
          <span aria-hidden="true">→</span>
        </button>
        <p className="fine-print">
          {copy.email.note}
          <br />
          {copy.email.noEmail}
        </p>
      </form>
    </section>
  );
}
export function PaywallScreen({
  titleRef,
  description,
  children,
}: Title & { description: string; children: React.ReactNode }) {
  return (
    <section className="step-card paywall-card">
      <p className="eyebrow">{copy.paywall.eyebrow}</p>
      <h1 ref={titleRef} tabIndex={-1}>
        {copy.paywall.title}
        <br />
        <em>{copy.paywall.emphasis}</em>
      </h1>
      <p className="lead">{description}</p>
      <ul className="benefits">
        {copy.paywall.benefits.map((benefit) => (
          <li key={benefit}>{benefit}</li>
        ))}
      </ul>
      {children}
    </section>
  );
}
export function InstallScreen({
  titleRef,
  email,
  onInstall,
}: Title & { email: string; onInstall: () => void }) {
  return (
    <section className="step-card install-card">
      <div className="success-orb" aria-hidden="true">
        ✓
      </div>
      <p className="eyebrow">{copy.install.eyebrow}</p>
      <h1 ref={titleRef} tabIndex={-1}>
        {copy.install.title}
        <br />
        <em>{copy.install.emphasis}</em>
      </h1>
      <p className="lead">
        {copy.install.confirmed}
        <br />
        <strong className="resolved-email">{email}</strong>
      </p>
      <p>{copy.install.description}</p>
      <a
        className="primary app-store"
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onInstall}
      >
        <span>{copy.install.download}</span>
        <span aria-hidden="true">↗</span>
      </a>
      <p className="fine-print">
        {copy.install.device}
        <br />
        {copy.install.note}
      </p>
    </section>
  );
}
