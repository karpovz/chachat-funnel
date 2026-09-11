import { describe, expect, it } from "vitest";
import { processCard, validateCard } from "../../src/server/processor";
const card={number:"4242 4242 4242 4242",expiry:"12/30",cvc:"123",cardholderName:"Demo Person",country:"US",postalCode:"10001"};
const now=new Date("2026-09-11T00:00:00Z");
describe("fake processor boundary",()=> {
  it("retains only brand, last four and deterministic outcome",()=> {
    expect(validateCard(card,now)).toEqual({brand:"visa",last4:"4242",outcome:"succeeded"});
    expect(JSON.stringify(validateCard(card,now))).not.toContain("123");
  });
  it.each(["4000000000000002","4000000000009995"])("recognizes demo failure %s",number=> {
    expect(validateCard({...card,number},now).outcome).toBe(number.endsWith("0002")?"declined":"timed_out");
  });
  it.each(["4242424242424241","0000000000000000","4242x424242424242","123456789012"])("rejects invalid PAN %s",number=>expect(()=>validateCard({...card,number},now)).toThrow("valid card"));
  it.each(["08/26","00/30","13/30","12/20","2030","12/99"])("rejects invalid expiry %s",expiry=>expect(()=>validateCard({...card,expiry},now)).toThrow("expiry"));
  it("accepts current expiry month through its last instant UTC",()=>expect(validateCard({...card,expiry:"09/26"},new Date("2026-09-30T23:59:59Z")).outcome).toBe("succeeded"));
  it("rejects an expired month on first instant of next month",()=>expect(()=>validateCard({...card,expiry:"09/26"},new Date("2026-10-01T00:00:00Z"))).toThrow("expiry"));
  it.each(["12","12a","12345"])("rejects invalid CVC %s",cvc=>expect(()=>validateCard({...card,cvc},now)).toThrow("security"));
  it("bounds simulated timeout",async()=> {
    const start=Date.now();
    expect(await processCard({brand:"visa",last4:"9995",outcome:"timed_out"})).toBe("timed_out");
    expect(Date.now()-start).toBeLessThan(3000);
  });
});
