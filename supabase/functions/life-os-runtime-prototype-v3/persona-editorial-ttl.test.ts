import {describe,expect,it} from "vitest";
import {approvalFreshness,APPROVAL_TTL_MS,evidenceReviewWindowMs,EVIDENCE_TTL_MS,FORMAT_GUIDANCE_TTL_MS,sealApprovedIdea,verifyApproval} from "./persona-brain.ts";
import {creativeShortlist} from "./persona-creative-core.ts";

const start=Date.parse("2026-10-09T00:00:00Z");
describe("Non-trending editorial format evidence expiration",()=>{
 it("uses the long bounded review window ONLY for official format guidance",()=>{
  const [editorial]=creativeShortlist(start);
  expect(evidenceReviewWindowMs(editorial)).toBe(FORMAT_GUIDANCE_TTL_MS);
  expect(evidenceReviewWindowMs({...editorial,evidenceKind:"LIVE_TREND"})).toBe(EVIDENCE_TTL_MS);
  expect(evidenceReviewWindowMs({...editorial,reviewProvenance:"UNVERIFIED"})).toBe(EVIDENCE_TTL_MS);
  expect(evidenceReviewWindowMs({...editorial,marketEvidence:[{source:"other",url:"https://example.org/test",asOf:"2026-10-08"}]})).toBe(EVIDENCE_TTL_MS);
 });
 it("keeps signed evergreen ideas actionable after day 30, but not unreviewed market trends",async()=>{
  const [editorial]=creativeShortlist(start);
  const signingKey="unit-test-not-a-production-credential";
  const signed=await sealApprovedIdea({...editorial,creativeVersion:1},signingKey,start);
  const after31Days=start+31*86_400_000;
  // The provenance and URLs are fixed; only the approval validity policy differs.
  expect((await verifyApproval(signed.approvalProof,signingKey,after31Days))?.freshness).toBe("cached");
  expect(approvalFreshness(signed.approvedAt,signed.evidenceCheckedAt,after31Days,
    FORMAT_GUIDANCE_TTL_MS,FORMAT_GUIDANCE_TTL_MS)).toBe("cached");
  expect(approvalFreshness(signed.approvedAt,signed.evidenceCheckedAt,after31Days,
    FORMAT_GUIDANCE_TTL_MS,APPROVAL_TTL_MS)).toBe("expired");
  const market={...editorial,evidenceKind:"LIVE_TREND"};
  const marketProof=await sealApprovedIdea({...market,creativeVersion:1},signingKey,start);
  expect(await verifyApproval(marketProof.approvalProof,signingKey,after31Days)).toBeNull();
  expect(await verifyApproval(signed.approvalProof,"wrong-key",after31Days)).toBeNull();
  expect(await verifyApproval(signed.approvalProof,signingKey,
    Date.parse("2027-04-07T00:00:01Z"))).toBeNull();
 });
 it("remains available at monthly free CI reset without inventing a new evidence date",()=>{
  const ideas=creativeShortlist(Date.parse("2026-11-01T00:00:00Z"));
  expect(ideas).toHaveLength(3);
  expect(ideas[0].marketEvidence).toEqual(creativeShortlist(start)[0].marketEvidence);
  expect(creativeShortlist(Date.parse("2027-04-07T00:00:00Z"))).toEqual([]);
 });
});
