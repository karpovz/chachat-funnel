"use client";

import type { PurchaseInput, PurchaseResult } from "@/shared/contracts";
import { copy } from "@/content/funnel";
import { useCheckout } from "@/hooks/use-checkout";

export function Checkout({
  sessionId,
  onSuccess,
}: {
  sessionId: string;
  onSuccess: (purchase: PurchaseResult) => void;
}) {
  const checkout = useCheckout(sessionId, onSuccess);
  const money = (amount: number, currency: string) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
      amount / 100,
    );
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const card: PurchaseInput["card"] = {
      number: String(data.get("number") ?? ""),
      expiry: String(data.get("expiry") ?? ""),
      cvc: String(data.get("cvc") ?? ""),
      cardholderName: String(data.get("cardholderName") ?? ""),
      country: String(data.get("country") ?? ""),
      postalCode: String(data.get("postalCode") ?? ""),
    };
    if (await checkout.submit(card)) form.reset();
  }
  const fieldError = (field: string) =>
    checkout.fields[`card.${field}`] ?? checkout.fields[field];
  return (
    <div className="checkout">
      {checkout.plansLoading && (
        <p role="status">{copy.checkout.loadingPlans}</p>
      )}
      {(checkout.planError ||
        (!checkout.plansLoading && checkout.plans.length === 0)) && (
        <div className="error-box" role="alert">
          {checkout.planError || copy.checkout.noPlans}
          <button onClick={() => void checkout.reloadPlans()}>
            {copy.checkout.retryPlans}
          </button>
        </div>
      )}
      <fieldset
        className="plan-grid"
        disabled={
          checkout.pending ||
          checkout.phase === "uncertain" ||
          checkout.purchase !== null ||
          checkout.planLocked ||
          !checkout.slug
        }
      >
        <legend className="sr-only">{copy.checkout.choose}</legend>
        {checkout.plans.map((plan) => (
          <label
            key={plan.id}
            className={`plan ${checkout.slug === plan.slug ? "selected" : ""}`}
          >
            {plan.isDefault && (
              <span className="plan-badge">{copy.checkout.best}</span>
            )}
            <input
              type="radio"
              name="plan"
              value={plan.slug}
              checked={checkout.slug === plan.slug}
              onChange={() => checkout.selectPlan(plan.slug)}
            />
            <span>{plan.name}</span>
            <strong>{money(plan.amountMinor, plan.currency)}</strong>
            <small>{plan.billingDescription}</small>
          </label>
        ))}
      </fieldset>
      {checkout.purchase && <p className="subtle">{copy.checkout.reserved}</p>}
      <div className="demo-note">
        <strong>{copy.checkout.demo}</strong>
        <span>{copy.checkout.demoDetails}</span>
      </div>
      <details className="test-cards">
        <summary>{copy.checkout.cards}</summary>
        <p>
          {copy.checkout.cardRules.map((card) => (
            <span key={card.label}>
              {card.label}: <code>{card.number}</code>
              <br />
            </span>
          ))}
          {copy.checkout.cardHint}
        </p>
      </details>
      <form onSubmit={submit} autoComplete="off" className="card-form">
        <fieldset disabled={checkout.pending}>
          <legend>{copy.checkout.paymentDetails}</legend>
          <label>
            {copy.checkout.name}
            <input
              name="cardholderName"
              placeholder={copy.checkout.namePlaceholder}
              required
              minLength={2}
              maxLength={120}
              autoComplete="off"
              aria-invalid={!!fieldError("cardholderName")}
              aria-describedby={
                fieldError("cardholderName") ? "checkout-errors" : undefined
              }
            />
          </label>
          <label>
            {copy.checkout.number}
            <input
              name="number"
              placeholder={copy.checkout.numberPlaceholder}
              required
              inputMode="numeric"
              minLength={12}
              maxLength={23}
              autoComplete="off"
              aria-invalid={!!fieldError("number")}
              aria-describedby={
                fieldError("number") ? "checkout-errors" : undefined
              }
            />
          </label>
          <div className="field-row">
            <label>
              {copy.checkout.expiry}
              <input
                name="expiry"
                placeholder={copy.checkout.expiryPlaceholder}
                required
                inputMode="numeric"
                minLength={4}
                maxLength={7}
                autoComplete="off"
                aria-invalid={!!fieldError("expiry")}
                aria-describedby={
                  fieldError("expiry") ? "checkout-errors" : undefined
                }
              />
            </label>
            <label>
              {copy.checkout.cvc}
              <input
                name="cvc"
                placeholder={copy.checkout.cvcPlaceholder}
                type="password"
                required
                inputMode="numeric"
                minLength={3}
                maxLength={4}
                autoComplete="off"
                aria-invalid={!!fieldError("cvc")}
                aria-describedby={
                  fieldError("cvc") ? "checkout-errors" : undefined
                }
              />
            </label>
          </div>
          <div className="field-row">
            <label>
              {copy.checkout.country}
              <select name="country" defaultValue="US">
                {copy.checkout.countries.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {copy.checkout.postal}
              <input
                name="postalCode"
                placeholder={copy.checkout.postalPlaceholder}
                required
                minLength={2}
                maxLength={16}
                autoComplete="off"
                aria-invalid={!!fieldError("postalCode")}
                aria-describedby={
                  fieldError("postalCode") ? "checkout-errors" : undefined
                }
              />
            </label>
          </div>
        </fieldset>
        {checkout.message && (
          <div className="error-box" id="checkout-errors" role="alert">
            {checkout.message}
            {Object.entries(checkout.fields).map(([field, errors]) => (
              <div key={field}>
                {field.replace("card.", "")}: {errors.join(" ")}
              </div>
            ))}
          </div>
        )}
        <button
          className="primary"
          disabled={checkout.pending || !checkout.selected}
        >
          {checkout.pending ? (
            <>
              <span className="spinner" />
              {checkout.phase === "recovering"
                ? copy.checkout.checking
                : copy.checkout.processing}
            </>
          ) : checkout.phase === "uncertain" ? (
            copy.checkout.recover
          ) : checkout.selected ? (
            copy.checkout.continue(
              checkout.selected.name,
              money(checkout.selected.amountMinor, checkout.selected.currency),
            )
          ) : (
            copy.checkout.loadingPlans
          )}
          <span aria-hidden="true">→</span>
        </button>
        <p className="fine-print">{copy.checkout.privacy}</p>
      </form>
    </div>
  );
}
