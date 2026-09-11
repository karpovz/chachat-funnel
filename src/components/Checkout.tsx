"use client";

import { useEffect, useRef, useState } from "react";
import type { Plan, PurchaseInput, PurchaseResult } from "@/shared/contracts";
import { api, ApiError, readSafe, saveSafe, track } from "@/hooks/funnel-api";

export function Checkout({ sessionId, plans, onSuccess }: { sessionId: string; plans: Plan[]; onSuccess: (purchase: PurchaseResult) => void }) {
  const [slug, setSlug] = useState(plans.find(plan => plan.isDefault)?.slug ?? "annual");
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(true);
  const [message, setMessage] = useState("");
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [purchase, setPurchase] = useState<PurchaseResult | null>(null);
  const lock = useRef(false);
  const success = useRef(onSuccess);
  useEffect(() => { success.current = onSuccess; }, [onSuccess]);
  const key = `chachat:attempt:${sessionId}`;
  const [uncertain, setUncertain] = useState(false);
  useEffect(() => {
    let active = true;
    const recover = async () => {
      try {
        const current = await api<PurchaseResult | null>("/purchases/current");
        if (!active || lock.current) return;
        setRecovering(false);
        setPurchase(current);
        if (current?.status === "succeeded") success.current(current);
        if (current?.status === "failed") {
          setMessage(current.message ?? "Payment didn’t go through. Check the demo card and try again.");
          saveSafe(key, null);
          setUncertain(false);
        }
        if (current && "planSlug" in current && typeof current.planSlug === "string") setSlug(current.planSlug);
        if (current?.status !== "processing" && !lock.current) setBusy(false);
      } catch { if (active && !lock.current) { setRecovering(false); setMessage("We couldn’t check your payment status. Reconnecting automatically…"); } }
    };
    void recover();
    const timer = setInterval(() => void recover(), 2500);
    return () => { active = false; clearInterval(timer); };
  }, [key]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || busy || recovering || purchase?.status === "processing") return;
    lock.current = true;
    setBusy(true); setMessage(""); setFields({});
    const form = event.currentTarget;
    const data = new FormData(form);
    const card: PurchaseInput["card"] = { number: String(data.get("number") ?? ""), expiry: String(data.get("expiry") ?? ""), cvc: String(data.get("cvc") ?? ""), cardholderName: String(data.get("cardholderName") ?? ""), country: String(data.get("country") ?? ""), postalCode: String(data.get("postalCode") ?? "") };
    const storedKey = readSafe<unknown>(key, null);
    const idempotencyKey = typeof storedKey === "string" && /^[0-9a-f-]{36}$/i.test(storedKey) ? storedKey : crypto.randomUUID();
    saveSafe(key, idempotencyKey);
    void track(sessionId, { name: "payment_submitted", screen: "paywall", stepIndex: 7, properties: { planSlug: slug } }).catch(() => {});
    try {
      const result = await api<PurchaseResult>("/purchases", "POST", { planSlug: slug, idempotencyKey, card });
      setPurchase(result); setUncertain(false);
      if (result.status === "succeeded") { form.reset(); onSuccess(result); }
      else if (result.status === "failed") { saveSafe(key, null); setMessage(result.message ?? "Your card was declined. Try another demo card."); }
    } catch (error) {
      if (error instanceof ApiError) {
        setMessage(error.message); setFields(error.fields ?? {});
        if (error.code.toLowerCase().includes("valid")) saveSafe(key, null);
      } else {
        setUncertain(true);
        setMessage("The connection was interrupted. We’re checking the result. If needed, resubmit the same card to safely recover this attempt.");
      }
    } finally { lock.current = false; setBusy(false); }
  }
  const displayedPlans = plans.map(plan => purchase?.planSlug === plan.slug ? {
    ...plan, name: purchase.planName, amountMinor: purchase.amountMinor,
    currency: purchase.currency, billingDescription: purchase.billingDescription,
  } : plan);
  const selected = displayedPlans.find(plan => plan.slug === slug);
  const pending = busy || recovering || purchase?.status === "processing";
  const money = (plan: Plan) => new Intl.NumberFormat("en-US", { style: "currency", currency: plan.currency }).format(plan.amountMinor / 100);
  return <div className="checkout">
    <fieldset className="plan-grid" disabled={pending || uncertain || purchase !== null}><legend className="sr-only">Choose your plan</legend>{displayedPlans.map(plan => <label key={plan.id} className={`plan ${slug === plan.slug ? "selected" : ""}`}>
      {plan.isDefault && <span className="plan-badge">BEST VALUE</span>}<input type="radio" name="plan" value={plan.slug} checked={slug === plan.slug} onChange={() => { setSlug(plan.slug); void track(sessionId, { name: "plan_selected", screen: "paywall", stepIndex: 7, properties: { planSlug: plan.slug, planId: plan.id, amountMinor: plan.amountMinor } }).catch(() => {}); }} />
      <span>{plan.name}</span><strong>{money(plan)}</strong><small>{plan.billingDescription}</small>
    </label>)}</fieldset>
    {purchase && <p className="subtle">Your checkout plan is reserved. Failed payments can be retried below.</p>}
    <div className="demo-note"><strong>DEMO CHECKOUT · NO REAL CHARGE</strong><span>Use test details only. This demo does not activate an app subscription.</span></div>
    <details className="test-cards"><summary>View demo cards</summary><p>Success: <code>4242 4242 4242 4242</code><br />Decline: <code>4000 0000 0000 0002</code><br />Timeout: <code>4000 0000 0000 9995</code><br />Use any future expiry and a 3-digit CVC.</p></details>
    <form onSubmit={submit} autoComplete="off" className="card-form">
      <fieldset disabled={pending}><legend>Payment details</legend>
        <label>Name on card<input name="cardholderName" placeholder="Demo User" required minLength={2} maxLength={120} autoComplete="off" /></label>
        <label>Card number<input name="number" placeholder="4242 4242 4242 4242" required inputMode="numeric" minLength={12} maxLength={23} autoComplete="off" /></label>
        <div className="field-row"><label>Expiry date<input name="expiry" placeholder="MM/YY" required minLength={4} maxLength={7} autoComplete="off" /></label><label>Security code<input name="cvc" placeholder="CVC" type="password" required inputMode="numeric" minLength={3} maxLength={4} autoComplete="off" /></label></div>
        <div className="field-row"><label>Country<select name="country" defaultValue="US"><option value="US">United States</option><option value="GB">United Kingdom</option><option value="CA">Canada</option><option value="AU">Australia</option><option value="DE">Germany</option><option value="FR">France</option><option value="IN">India</option><option value="JP">Japan</option><option value="BR">Brazil</option><option value="NL">Netherlands</option></select></label><label>Postal code<input name="postalCode" placeholder="10001" required minLength={2} maxLength={16} autoComplete="off" /></label></div>
      </fieldset>
      {message && <div className="error-box" role="alert">{message}{Object.entries(fields).map(([field, errors]) => <div key={field}>{field.replace("card.", "")}: {errors.join(" ")}</div>)}</div>}
      <button className="primary" disabled={pending || !selected}>{pending ? <><span className="spinner" />{recovering ? "Checking checkout…" : "Processing demo payment…"}</> : uncertain ? "Recover my payment" : `Continue with ${selected?.name ?? "plan"} · ${selected ? money(selected) : ""}`}<span aria-hidden="true">→</span></button>
      <p className="fine-print">No money is charged. Card details are never saved. This is a demonstration of the checkout experience.</p>
    </form>
  </div>;
}
