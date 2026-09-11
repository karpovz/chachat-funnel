import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const context=vi.hoisted(()=>({visitor:"",session:""}));
vi.mock("next/headers",()=>({cookies:async()=>({get:(name:string)=>({value:name==="chachat_visitor"?context.visitor:context.session})})}));
import { db } from "../../src/server/db";
import { currentPurchase, purchase, STALE_ATTEMPT_MS } from "../../src/server/payments";
import { ingestEvent, resolveEmail } from "../../src/server/funnel";
const card={number:"4242424242424242",expiry:"12/30",cvc:"123",cardholderName:"Never Stored",country:"US",postalCode:"10001"};
const sessions:string[]=[];const visitors:string[]=[];const users:string[]=[];
async function fixture(email?:string) {
  const user=email?await db.user.create({data:{email,normalizedEmail:email}}):null;
  if(user)users.push(user.id);
  const visitor=await db.visitor.create({data:{}});visitors.push(visitor.id);
  const session=await db.funnelSession.create({data:{visitorId:visitor.id,userId:user?.id,funnelVersion:"test",currentStep:email?"paywall":"email",landingUrl:"https://example.test/?utm_source=test",utmSource:"test"}});sessions.push(session.id);
  context.visitor=visitor.id;context.session=session.id;
  return session;
}
const run=["true","1"].includes(process.env.RUN_DB_TESTS??"")?describe:describe.skip;
run("PostgreSQL payment and identity invariants",()=> {
  beforeAll(async()=>{await db.$connect();});
  afterAll(async()=> {
    await db.paymentAttempt.deleteMany({where:{purchase:{sessionId:{in:sessions}}}});
    await db.purchase.deleteMany({where:{sessionId:{in:sessions}}});
    await db.event.deleteMany({where:{sessionId:{in:sessions}}});
    await db.quizAnswer.deleteMany({where:{sessionId:{in:sessions}}});
    await db.funnelSession.deleteMany({where:{id:{in:sessions}}});
    await db.visitor.deleteMany({where:{id:{in:visitors}}});
    await db.user.deleteMany({where:{id:{in:users}}});
    await db.$disconnect();
  });
  it("same-key concurrency yields one purchase/attempt, success terminal, no sensitive data",async()=> {
    const session=await fixture(`success-${randomUUID()}@example.test`);
    const input={planSlug:"annual",idempotencyKey:randomUUID(),card};
    await Promise.all([purchase(input),purchase(input),purchase({...input,idempotencyKey:randomUUID()})]);
    expect((await currentPurchase())?.status).toBe("succeeded");
    await purchase({...input,idempotencyKey:randomUUID()});
    expect(await db.purchase.count({where:{sessionId:session.id}})).toBe(1);
    const attempts=await db.paymentAttempt.findMany({where:{purchase:{sessionId:session.id}}});
    expect(attempts).toHaveLength(1);
    const records=JSON.stringify({attempts,events:await db.event.findMany({where:{sessionId:session.id}})});
    expect(records).not.toContain(card.number);expect(records).not.toContain(card.cardholderName);
    expect(attempts[0]?.cardLast4).toBe("4242");
  });
  it("decline replay remains declined after successful retry and price snapshot stays authoritative",async()=> {
    const session=await fixture(`decline-${randomUUID()}@example.test`);
    const input={planSlug:"monthly",idempotencyKey:randomUUID(),card:{...card,number:"4000000000000002"}};
    expect((await purchase(input))?.failureCode).toBe("card_declined");
    const plan=await db.plan.findUniqueOrThrow({where:{slug:"monthly"}});
    try {
      await db.plan.update({where:{id:plan.id},data:{amountMinor:12345}});
      expect(await currentPurchase()).toMatchObject({planSlug:"monthly",amountMinor:2999,currency:"USD"});
      expect(await purchase({...input,idempotencyKey:randomUUID(),card})).toMatchObject({status:"succeeded",amountMinor:2999});
    } finally { await db.plan.update({where:{id:plan.id},data:{amountMinor:plan.amountMinor}}); }
    expect((await purchase(input))?.failureCode).toBe("card_declined");
    expect((await db.purchase.findUniqueOrThrow({where:{sessionId:session.id}})).amountMinor).toBe(2999);
    expect(await db.paymentAttempt.count({where:{purchase:{sessionId:session.id}}})).toBe(2);
  });
  it("same email remains resumable after checkout while ownership changes are rejected",async()=> {
    const email=`resume-${randomUUID()}@example.test`;
    const session=await fixture(email);
    for(const questionId of ["intent","character_type","interaction_mode","memory","usage_moment"])await db.quizAnswer.create({data:{sessionId:session.id,questionId,answerIds:["test"]}});
    await purchase({planSlug:"annual",idempotencyKey:randomUUID(),card:{...card,number:"4000000000000002"}});
    expect((await resolveEmail(` ${email.toUpperCase()} `)).currentStep).toBe("paywall");
    await expect(resolveEmail("different@example.test")).rejects.toMatchObject({code:"checkout_started"});
    expect((await db.funnelSession.findUniqueOrThrow({where:{id:session.id}})).userId).toBe(session.userId);
  });
  it("timeout and crashed processing are terminal and retryable",async()=> {
    const session=await fixture(`timeout-${randomUUID()}@example.test`);
    const input={planSlug:"annual",idempotencyKey:randomUUID(),card:{...card,number:"4000000000009995"}};
    expect((await purchase(input))?.failureCode).toBe("processor_timeout");
    const order=await db.purchase.findUniqueOrThrow({where:{sessionId:session.id}});
    await db.purchase.update({where:{id:order.id},data:{status:"processing"}});
    await db.paymentAttempt.create({data:{purchaseId:order.id,idempotencyKey:randomUUID(),attemptNumber:2,status:"processing",startedAt:new Date(Date.now()-STALE_ATTEMPT_MS-1000)}});
    expect((await currentPurchase())?.failureCode).toBe("processor_timeout");
    expect((await purchase({...input,idempotencyKey:randomUUID(),card}))?.status).toBe("succeeded");
  });
  it("database rejects a second active processing attempt",async()=> {
    const session=await fixture(`constraint-${randomUUID()}@example.test`);
    await purchase({planSlug:"annual",idempotencyKey:randomUUID(),card:{...card,number:"4000000000000002"}});
    const order=await db.purchase.findUniqueOrThrow({where:{sessionId:session.id}});
    await db.paymentAttempt.create({data:{purchaseId:order.id,idempotencyKey:randomUUID(),attemptNumber:2,status:"processing"}});
    await expect(db.paymentAttempt.create({data:{purchaseId:order.id,idempotencyKey:randomUUID(),attemptNumber:3,status:"processing"}})).rejects.toMatchObject({code:"P2002"});
  });
  it("event dedup strips arbitrary sensitive properties",async()=> {
    const session=await fixture();
    const input={clientEventId:randomUUID(),name:"screen_viewed" as const,screen:"email" as const,occurredAt:new Date().toISOString(),properties:{email:"leak@example.test",cardNumber:card.number,cvc:card.cvc}};
    await Promise.all([ingestEvent(input),ingestEvent(input)]);
    const events=await db.event.findMany({where:{sessionId:session.id}});
    expect(events).toHaveLength(1);expect(events[0]?.properties).toEqual({});
  });
  it("normalized existing email preserves anonymous history via session",async()=> {
    const email=`identity-${randomUUID()}@example.test`;
    const original=await fixture(email);const userId=original.userId;
    const session=await fixture();
    for(const questionId of ["intent","character_type","interaction_mode","memory","usage_moment"])await db.quizAnswer.create({data:{sessionId:session.id,questionId,answerIds:["test"]}});
    await ingestEvent({clientEventId:randomUUID(),name:"screen_viewed",screen:"email",occurredAt:new Date().toISOString(),properties:{}});
    await resolveEmail(` ${email.toUpperCase()} `);
    expect((await db.funnelSession.findUniqueOrThrow({where:{id:session.id}})).userId).toBe(userId);
    expect(await db.user.count({where:{normalizedEmail:email}})).toBe(1);
    expect(await db.event.count({where:{session:{userId},name:"screen_viewed"}})).toBe(1);
  });
});
