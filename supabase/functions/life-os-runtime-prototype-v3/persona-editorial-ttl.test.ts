import {describe,expect,it} from "vitest";
import {evidenceReviewWindowMs,EVIDENCE_TTL_MS,FORMAT_GUIDANCE_TTL_MS} from "./persona-brain.ts";
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
 it("remains available at monthly free CI reset without inventing a new evidence date",()=>{
  const ideas=creativeShortlist(Date.parse("2026-11-01T00:00:00Z"));
  expect(ideas).toHaveLength(3);
  expect(ideas[0].marketEvidence).toEqual(creativeShortlist(start)[0].marketEvidence);
  expect(creativeShortlist(Date.parse("2027-04-07T00:00:00Z"))).toEqual([]);
 });
});
