import { describe, expect, it } from "vitest";
import { decidePersonaCandidate, canPublishPersonaCandidate } from "./persona-approval";
import type { PersonaApprovalRecord } from "./persona-state";

describe("Persona approval workflow", () => {
  it("requires explicit approval before publication", () => {
    expect(canPublishPersonaCandidate(undefined)).toBe(false);
    const approved = decidePersonaCandidate({ candidateId: "c1", previous: undefined, decision: "approved", reason: null, now: "2026-10-04T12:00:00.000Z" });
    expect(canPublishPersonaCandidate(approved)).toBe(true);
  });

  it("increments revision and keeps rework/defer/reject non-publishable", () => {
    const first: PersonaApprovalRecord = { candidateId: "c1", revision: 1, decision: "rework", reason: "Сделать начало короче", decidedAt: "2026-10-04T12:00:00.000Z" };
    const deferred = decidePersonaCandidate({ candidateId: "c1", previous: first, decision: "deferred", reason: null, now: "2026-10-04T13:00:00.000Z" });
    expect(deferred.revision).toBe(2);
    expect(canPublishPersonaCandidate(first)).toBe(false);
    expect(canPublishPersonaCandidate(deferred)).toBe(false);
  });

  it("rejects a decision for another candidate history", () => {
    const previous: PersonaApprovalRecord = { candidateId: "other", revision: 1, decision: "approved", reason: null, decidedAt: "2026-10-04T12:00:00.000Z" };
    expect(() => decidePersonaCandidate({ candidateId: "c1", previous, decision: "rejected", reason: null, now: "2026-10-04T13:00:00.000Z" })).toThrow("candidate");
  });
});
