import { describe, expect, it } from "vitest";
import { SkillRegistry } from "./skills";
import { assessSkillAdmission, registerAuditedSkill, type ExternalSkillCandidate } from "./skill-admission";

const good: ExternalSkillCandidate = {
  provenance: {
    id: "media-skill", sourceUrl: "https://github.com/owner/repo",
    sourceRevision: "a".repeat(40), contentSha256: "b".repeat(64), license: "MIT",
  },
  review: {
    reviewedSource: true, licenseAccepted: true, automatedScanPassed: true,
    reviewerId: "qa-1", risk: "read_only", requestedPermissions: ["media.read"],
    approvedPermissions: ["media.read"], unresolvedFindings: [],
    handlesPersonalData: false, externalDataTransferApproved: false,
    additionalSideEffectApproval: false,
  },
  benchmarks: { cases: 3, passed: 3, observedQuality: 0.93 },
  humanApproved: true,
};
describe("skill admission", () => {
  it("admits audited local implementation only", () => {
    const r = new SkillRegistry();
    const skill = { id: "media-skill", description: "Local test", async plan() { return []; } };
    expect(assessSkillAdmission(good).allowedToRegister).toBe(true);
    registerAuditedSkill(r, good, skill);
    expect(r.get("media-skill")).toBe(skill);
  });
  it("rejects non-immutable or credentialed sources", () => {
    const a = { ...good, provenance: { ...good.provenance, sourceRevision: "main" } };
    const b = { ...good, provenance: { ...good.provenance,
      sourceUrl: "https://secret:token@github.com/owner/repo" } };
    expect(assessSkillAdmission(a).status).toBe("blocked");
    expect(assessSkillAdmission(b).status).toBe("blocked");
  });
  it("cannot promote skill with unresolved findings", () => {
    expect(assessSkillAdmission({ ...good, review: { ...good.review,
      unresolvedFindings: ["exfiltration"] } }).status).toBe("blocked");
  });
  it("enforces least-privilege permissions", () => {
    expect(assessSkillAdmission({ ...good, review: { ...good.review,
      requestedPermissions: ["media.read", "network.write"] } }).status).toBe("needs_review");
  });
  it("requires explicit personal data and side-effect review", () => {
    expect(assessSkillAdmission({ ...good, review: { ...good.review,
      handlesPersonalData: true } }).allowedToRegister).toBe(false);
    expect(assessSkillAdmission({ ...good, review: { ...good.review,
      risk: "external_side_effect" } }).allowedToRegister).toBe(false);
  });
  it("requires measured sandbox quality", () => {
    expect(assessSkillAdmission({ ...good, benchmarks: { cases: 2, passed: 2,
      observedQuality: .99 } }).status).toBe("sandbox_ready");
    expect(assessSkillAdmission({ ...good, benchmarks: { cases: 3, passed: 3,
      observedQuality: .5 } }).status).toBe("sandbox_ready");
  });
  it("does not treat automated scan as human approval", () => {
    expect(assessSkillAdmission({ ...good, humanApproved: false }).allowedToRegister).toBe(false);
  });
  it("enforces provenance-to-code identifier match", () => {
    const r = new SkillRegistry();
    expect(() => registerAuditedSkill(r, good, {
      id: "another", description: "", async plan() { return []; },
    })).toThrow(/do not match/);
  });
});