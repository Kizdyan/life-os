import { describe, expect, it } from "vitest";
import { assessLocalSkillSourceEvidence } from "./skill-source-evidence";
import type { SkillDirectoryRecord } from "./skill-intelligence";
import type { ExternalSkillCandidate } from "./skill-admission";

const manifestSha256 = "a".repeat(64);
const bundleSha256 = "b".repeat(64);
const record: SkillDirectoryRecord = {
  id: "test-skill", title: "Test", description: "Public test package",
  sourceUrl: "https://github.com/test-owner/test-repo",
  sourceRevision: "c".repeat(40), skillPath: "skills/test-skill",
  manifestSha256, domains: ["video"], supportedAgents: ["codex"],
  advertisedTools: [], requestedPermissions: [], license: "MIT",
};
const admission: ExternalSkillCandidate = {
  provenance: {
    id: "test-skill", sourceUrl: record.sourceUrl,
    sourceRevision: record.sourceRevision!, contentSha256: manifestSha256,
    bundleSha256, license: "MIT",
  },
  review: {
    reviewedSource: true, licenseAccepted: true, automatedScanPassed: true,
    reviewerId: "reviewer", risk: "read_only", requestedPermissions: [],
    approvedPermissions: [], unresolvedFindings: [], handlesPersonalData: false,
    externalDataTransferApproved: false, additionalSideEffectApproval: false,
  },
  benchmarks: { cases: 3, passed: 3, observedQuality: .95 },
  humanApproved: true,
};
const audit = {
  schemaVersion: 1, manifestSha256, bundleSha256,
  inventoryComplete: true, staticCheckPassed: true,
  scannedFiles: 2, findings: [],
  revisionVerified: true,
  verificationMethod: "pinned-local-git-tree-blob",
  sourceRevision: record.sourceRevision,
  sourceSkillPath: record.skillPath,
  installationPerformed: false, executionPerformed: false,
};
describe("Local source evidence: metadata and SHA attestation", () => {
  it("accepts a consistent fully attested synthetic report without installing", () => {
    const result = assessLocalSkillSourceEvidence(record, admission, audit);
    expect(result.verified).toBe(true);
  });
  it("fails closed on a missing report or unverified source revision", () => {
    expect(assessLocalSkillSourceEvidence(record, admission, null).verified).toBe(false);
    expect(assessLocalSkillSourceEvidence(record, admission, { ...audit, revisionVerified: false }).verified).toBe(false);
  });
  it("requires matching source and bundle digests", () => {
    expect(assessLocalSkillSourceEvidence({ ...record, manifestSha256: "d".repeat(64) }, admission, audit).verified).toBe(false);
    expect(assessLocalSkillSourceEvidence(record, admission, { ...audit, bundleSha256: "e".repeat(64) }).verified).toBe(false);
    expect(assessLocalSkillSourceEvidence(record, {
      ...admission, provenance: { ...admission.provenance, bundleSha256: undefined },
    }, audit).verified).toBe(false);
  });
  it("rejects a report generated after third-party execution or install", () => {
    expect(assessLocalSkillSourceEvidence(record, admission, { ...audit, executionPerformed: true }).verified).toBe(false);
    expect(assessLocalSkillSourceEvidence(record, admission, { ...audit, installationPerformed: true }).verified).toBe(false);
  });
  it("blocks incomplete inventory and findings despite clean booleans", () => {
    expect(assessLocalSkillSourceEvidence(record, admission, { ...audit, scannedFiles: 0 }).verified).toBe(false);
    expect(assessLocalSkillSourceEvidence(record, admission, { ...audit, findings: [
      { path: "script.sh", rule: "untrusted", severity: "block" },
    ] }).verified).toBe(false);
  });
  it("rejects forged boolean without an attested Git tree and exact skill path", () => {
    expect(assessLocalSkillSourceEvidence(record, admission, {
      ...audit, verificationMethod: undefined,
    }).verified).toBe(false);
    expect(assessLocalSkillSourceEvidence(record, admission, {
      ...audit, sourceRevision: "f".repeat(40),
    }).verified).toBe(false);
    expect(assessLocalSkillSourceEvidence(record, admission, {
      ...audit, sourceSkillPath: "skills/other",
    }).verified).toBe(false);
  });
  it("requires exact revision provenance match", () => {
    expect(assessLocalSkillSourceEvidence(record, {
      ...admission, provenance: { ...admission.provenance, sourceRevision: "f".repeat(40) },
    }, audit).verified).toBe(false);
  });
});
