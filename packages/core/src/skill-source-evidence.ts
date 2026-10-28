/**
 * Bind the local read-only package inventory to the reviewed provenance.
 * This checks consistency of supplied audit evidence; an assertion about
 * upstream revision is still subject to independent human verification.
 * It does not install, open or execute a Skill.
 */
import type { SkillDirectoryRecord } from "./skill-intelligence";
import type { ExternalSkillCandidate } from "./skill-admission";

export interface LocalSkillSourceAudit {
  schemaVersion: number;
  manifestSha256: string | null;
  bundleSha256: string | null;
  inventoryComplete: boolean;
  staticCheckPassed: boolean;
  scannedFiles: number;
  findings: Array<{ path: string; rule: string; severity: string }>;
  revisionVerified: boolean;
  /** Produced by the local read-only pinned Git object verifier, not by directory scan. */
  verificationMethod?: string;
  sourceRevision?: string;
  sourceSkillPath?: string;
  installationPerformed: boolean;
  executionPerformed: boolean;
}
const SHA256 = /^[a-f0-9]{64}$/i;

export function assessLocalSkillSourceEvidence(
  record: SkillDirectoryRecord,
  candidate: ExternalSkillCandidate,
  report: LocalSkillSourceAudit | null,
): { verified: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!report) return { verified: false, reasons: ["Local package hash audit missing"] };
  if (report.schemaVersion !== 1) reasons.push("Unsupported package audit version");
  if (!report.inventoryComplete || !report.staticCheckPassed ||
      !Number.isSafeInteger(report.scannedFiles) || report.scannedFiles < 1 ||
      !Array.isArray(report.findings) || report.findings.length > 0) {
    reasons.push("Local source inventory incomplete or contains findings");
  }
  if (!report.revisionVerified ||
      report.verificationMethod !== "pinned-local-git-tree-blob" ||
      report.sourceRevision !== record.sourceRevision ||
      report.sourceSkillPath !== record.skillPath) {
    reasons.push("Pinned local Git source attestation missing or does not match catalog record");
  }
  if (report.installationPerformed || report.executionPerformed) {
    reasons.push("Inspection must precede any third-party installation or execution");
  }
  if (!report.manifestSha256 || !SHA256.test(report.manifestSha256) ||
      record.manifestSha256 !== report.manifestSha256 ||
      candidate.provenance.contentSha256 !== report.manifestSha256) {
    reasons.push("Measured manifest digest does not match approved provenance");
  }
  if (!report.bundleSha256 || !SHA256.test(report.bundleSha256) ||
      candidate.provenance.bundleSha256 !== report.bundleSha256) {
    reasons.push("Complete source bundle digest does not match reviewed provenance");
  }
  if (record.sourceRevision !== candidate.provenance.sourceRevision) {
    reasons.push("Source revision mismatch");
  }
  return { verified: reasons.length === 0, reasons };
}
