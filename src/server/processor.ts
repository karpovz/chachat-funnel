import type { PurchaseInput } from "@/shared/contracts";
import { ApiError } from "./http";
export function validateCard(card:PurchaseInput["card"],now=new Date()) {
  const number=card.number.replace(/[ -]/g,"");
  let sum=0;
  for(let i=number.length-1,alternate=false;i>=0;i--,alternate=!alternate) { let digit=Number(number[i]); if(alternate){digit*=2;if(digit>9)digit-=9;} sum+=digit; }
  if(!/^\d{12,19}$/.test(number)||sum%10!==0||/^0+$/.test(number)) throw new ApiError(400,"invalid_card","Enter a valid card number.");
  const expiry=/^(\d{2})\s*\/\s*(\d{2}|\d{4})$/.exec(card.expiry);
  const month=Number(expiry?.[1]); const year=Number(expiry?.[2])+(expiry?.[2]?.length===2?2000:0);
  if(!expiry||month<1||month>12||year<now.getUTCFullYear()||(year===now.getUTCFullYear()&&month<now.getUTCMonth()+1)||year>now.getUTCFullYear()+30) throw new ApiError(400,"invalid_expiry","Enter a valid future expiry date.");
  if(!/^\d{3,4}$/.test(card.cvc)) throw new ApiError(400,"invalid_cvc","Enter a valid security code.");
  return {brand:number.startsWith("4")?"visa":number.startsWith("5")?"mastercard":"other",last4:number.slice(-4),outcome:number==="4000000000000002"?"declined" as const:number==="4000000000009995"?"timed_out" as const:"succeeded" as const};
}
export type SafeCard=ReturnType<typeof validateCard>;
export async function processCard(card:SafeCard):Promise<SafeCard["outcome"]> {
  let deadline:ReturnType<typeof setTimeout>|undefined;
  let operation:ReturnType<typeof setTimeout>|undefined;
  try {
    return await Promise.race([
      new Promise<SafeCard["outcome"]>(resolve=> {
        // The timeout card models a processor that never responds.
        if(card.outcome!=="timed_out") operation=setTimeout(()=>resolve(card.outcome),450);
      }),
      new Promise<SafeCard["outcome"]>(resolve=>{deadline=setTimeout(()=>resolve("timed_out"),1500);}),
    ]);
  } finally { clearTimeout(deadline); clearTimeout(operation); }
}
