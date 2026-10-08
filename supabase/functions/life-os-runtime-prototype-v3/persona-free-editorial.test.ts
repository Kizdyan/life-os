import { describe, expect, it } from "vitest";
import { approvePersonaCandidate, validatePersonaShootingBrief } from "./quality-gates.ts";
import { buildDeterministicShootingBrief, verifyApproval, isActionableApproval } from "./persona-brain.ts";
import {
  FREE_EDITORIAL_ID, FREE_EDITORIAL_TITLE, freeEditorialCandidate,
  signFreeEditorialStarter,
} from "./persona-free-editorial.ts";
import { normalizePersonaRecommendationPayload } from "../../../apps/web/src/persona-opportunity.ts";

const secret = "nonproduction-editorial-test-signing-key";
const now = Date.parse("2026-10-09T00:15:00Z");

describe("Persona FREE_ONLY editorial starter — physical acceptance regression", () => {
  it("is a transparent, bounded, editor-reviewed idea with real official format sources", () => {
    const idea = freeEditorialCandidate(now);
    expect(idea?.id).toBe(FREE_EDITORIAL_ID);
    expect(idea?.reviewProvenance).toContain("NO_PAID_AI");
    expect(idea?.reason).toMatch(/НЕ заявляются/);
    expect(idea?.qualityVerdict).toMatchObject({ verdict: "APPROVE", score: 83 });
    expect(approvePersonaCandidate(idea, now).approved).toBe(true);
  });
  it("seals the SAME approval that the iPhone quality gate and shooting route consume", async () => {
    const sealed = await signFreeEditorialStarter(secret, [], now);
    expect(sealed?.approvalProof.length).toBeGreaterThan(60);
    expect(sealed?.freshness).toBe("cached");
    const verified = await verifyApproval(sealed?.approvalProof, secret, now);
    expect(verified?.idea.id).toBe(FREE_EDITORIAL_ID);
    expect(isActionableApproval(verified)).toBe(true);
    expect(normalizePersonaRecommendationPayload({ recommendation: verified?.idea }).recommendation?.id)
      .toBe(FREE_EDITORIAL_ID);
    const brief = buildDeterministicShootingBrief(verified!.idea);
    expect(validatePersonaShootingBrief(brief)).toEqual([]);
    expect(brief.orientation).toBe("vertical");
    expect((brief.shots as unknown[]).length).toBeGreaterThan(0);
  });
  it("blocks a user-rejected or already-used idea, instead of reapproving it", async () => {
    for (const status of ["rejected", "used", "later"]) {
      expect(await signFreeEditorialStarter(secret, [{ title: FREE_EDITORIAL_TITLE, status }], now))
        .toBeNull();
    }
  });
  it("never refreshes evidence date automatically, and expires without paid AI", async () => {
    const expired = Date.parse("2026-10-16T00:00:01Z");
    expect(freeEditorialCandidate(expired)).toBeNull();
    expect(await signFreeEditorialStarter(secret, [], expired)).toBeNull();
    expect(freeEditorialCandidate(Date.parse("2026-10-07T12:00:00Z"))).toBeNull();
    const signed = await signFreeEditorialStarter(secret, [], now);
    expect(isActionableApproval(await verifyApproval(signed?.approvalProof, secret, expired))).toBe(false);
    expect(await verifyApproval(signed?.approvalProof, "wrong-signing-key", now)).toBeNull();
  });
});
