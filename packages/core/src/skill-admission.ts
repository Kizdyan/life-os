/**
 * Auditable admission gate for externally discovered agent skills.
 * Does not download, install or execute third-party code.
 */
import { SkillRegistry, type Skill } from "./skills";

export type SkillRisk = "read_only" | "limited_write" | "external_side_effect";
export type SkillAdmissionStatus = "blocked" | "needs_review" | "sandbox_ready" | "approved";

export interface ExternalSkillProvenance {
  id: string;
  sourceUrl: string;
  sourceRevision: string;
  contentSha256: string;
  /** Optional in legacy callers; required for new source-attested routing. */
  bundleSha256?: string;
  license: string | null;
}
export interface ExternalSkillRiskReview {
  reviewedSource: boolean;
  licenseAccepted: boolean;
  automatedScanPassed: boolean;
  reviewerId: string | null;
  risk: SkillRisk;
  requestedPermissions: string[];
  approvedPermissions: string[];
  unresolvedFindings: string[];
  /**
   * Explicit reviewer acknowledgements keyed as path::rule.
   * Never overrides severity=block. Optional for trusted internal callers.
   */
  acknowledgedFindings?: string[];
  handlesPersonalData: boolean;
  externalDataTransferApproved: boolean;
  additionalSideEffectApproval: boolean;
}
export interface ExternalSkillBenchmarks {
  cases: number;
  passed: number;
  observedQuality: number | null;
}
export interface ExternalSkillCandidate {
  provenance: ExternalSkillProvenance;
  review: ExternalSkillRiskReview;
  benchmarks: ExternalSkillBenchmarks;
  humanApproved: boolean;
}
export interface SkillAdmissionDecision {
  status: SkillAdmissionStatus;
  allowedToRegister: boolean;
  reasons: string[];
}
const SAFE_ID = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
const GIT_COMMIT = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;

export function assessSkillAdmission(candidate: ExternalSkillCandidate): SkillAdmissionDecision {
  const { provenance: p, review: r, benchmarks: b } = candidate;
  const blocked: string[] = [];
  const pending: string[] = [];
  if (!SAFE_ID.test(p.id)) blocked.push("Invalid or unsafe skill identifier");
  let url: URL | null = null;
  try { url = new URL(p.sourceUrl); } catch { blocked.push("Invalid source URL"); }
  if (url && (url.protocol !== "https:" || !["github.com", "gitlab.com"].includes(url.hostname) ||
      url.username || url.password)) {
    blocked.push("Source must be canonical HTTPS GitHub or GitLab without embedded credentials");
  }
  if (!GIT_COMMIT.test(p.sourceRevision)) blocked.push("Immutable source commit required");
  if (!SHA256.test(p.contentSha256)) blocked.push("SHA-256 file digest required");
  if (p.bundleSha256 !== undefined && !SHA256.test(p.bundleSha256)) {
    blocked.push("Invalid source bundle SHA-256 digest");
  }
  if (!p.license?.trim() || !r.licenseAccepted) pending.push("License must be reviewed");
  if (!r.reviewedSource || !r.automatedScanPassed || !r.reviewerId?.trim()) {
    pending.push("Human source review, reviewer identity and security scan required");
  }
  if (r.unresolvedFindings.length > 0) blocked.push("Security findings must be resolved");
  if (r.acknowledgedFindings &&
      (new Set(r.acknowledgedFindings).size !== r.acknowledgedFindings.length ||
       r.acknowledgedFindings.some(key => !key.trim() || key.length > 400))) {
    blocked.push("Invalid or duplicate security finding acknowledgements");
  }
  const requested = new Set(r.requestedPermissions);
  const approved = new Set(r.approvedPermissions);
  if (requested.size !== r.requestedPermissions.length ||
      approved.size !== r.approvedPermissions.length ||
      r.requestedPermissions.some((permission) => !permission.trim())) {
    blocked.push("Invalid or duplicate permission declarations");
  }
  if ([...requested].some((permission) => !approved.has(permission))) {
    pending.push("Requested tool permissions exceed reviewed permissions");
  }
  if (r.handlesPersonalData && !r.externalDataTransferApproved) {
    pending.push("Personal-data transfer requires explicit approval");
  }
  if (r.risk === "external_side_effect" && !r.additionalSideEffectApproval) {
    pending.push("External side effects require explicit approval");
  }
  if (!Number.isSafeInteger(b.cases) || b.cases < 0 ||
      !Number.isSafeInteger(b.passed) || b.passed < 0 || b.passed > b.cases ||
      (b.observedQuality !== null &&
       (!Number.isFinite(b.observedQuality) || b.observedQuality < 0 || b.observedQuality > 1))) {
    blocked.push("Invalid measured benchmark evidence");
  }
  if (blocked.length > 0) return { status: "blocked", allowedToRegister: false, reasons: blocked };
  if (pending.length > 0) return { status: "needs_review", allowedToRegister: false, reasons: pending };
  if (b.cases < 3 || b.passed !== b.cases || b.observedQuality === null ||
      b.observedQuality < 0.8) {
    return {
      status: "sandbox_ready", allowedToRegister: false,
      reasons: ["Minimum three fully passed sandbox scenarios and >=0.80 quality required"],
    };
  }
  if (!candidate.humanApproved) {
    return { status: "needs_review", allowedToRegister: false,
      reasons: ["Final human admission approval missing"] };
  }
  return { status: "approved", allowedToRegister: true, reasons: [] };
}

/** Only a locally provided implementation can be registered; no remote execution. */
export function registerAuditedSkill(
  registry: SkillRegistry, candidate: ExternalSkillCandidate, implementation: Skill,
): void {
  if (implementation.id !== candidate.provenance.id) {
    throw new Error("Implementation id and reviewed provenance do not match");
  }
  const decision = assessSkillAdmission(candidate);
  if (!decision.allowedToRegister) {
    throw new Error(`Skill admission denied: ${decision.reasons.join("; ")}`);
  }
  registry.register(implementation);
}
