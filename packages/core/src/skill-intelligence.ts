/**
 * Skill Intelligence P1: deterministic discovery, local static inspection and
 * evidence-gated route planning. No network requests, installs or execution.
 * Catalog descriptions are untrusted claims, not proof of capabilities.
 */
import { assessSkillAdmission, type ExternalSkillCandidate } from "./skill-admission";
import { assessLocalSkillSourceEvidence, type LocalSkillSourceAudit } from "./skill-source-evidence";
import { routeAICapability, type AICapabilityProvider, type AICapabilityTask, type CapabilityDomain, type DataClassification } from "./ai-capacity-routing";

export type SkillAgent = "claude-code" | "codex" | "cursor" | "opencode";
export interface SkillDirectoryRecord {
  id: string;
  title: string;
  description: string;
  sourceUrl: string;
  sourceRevision: string | null;
  skillPath: string;
  manifestSha256: string | null;
  domains: CapabilityDomain[];
  supportedAgents: SkillAgent[];
  advertisedTools: string[];
  requestedPermissions: string[];
  license: string | null;
}
export interface SkillDiscoveryQuery {
  domain: CapabilityDomain;
  agent: SkillAgent;
  keywords: string[];
  requiredTools: string[];
  classification: DataClassification;
}
export interface SkillSuggestion {
  record: SkillDirectoryRecord;
  score: number;
  status: "discovery_only";
  cautions: string[];
}
export interface SkillTextFile { path: string; content: string }
export type InspectionSeverity = "block" | "review";
export interface SkillInspectionFinding {
  path: string;
  rule: string;
  severity: InspectionSeverity;
}
export interface SkillInspection {
  inventoryComplete: boolean;
  staticCheckPassed: boolean;
  filesReviewed: number;
  findings: SkillInspectionFinding[];
  /** A static scan never constitutes human approval or guarantees safety. */
  humanReviewRequired: true;
}
export interface SkillRouteBinding {
  providerId: string;
  agent: SkillAgent;
}
export interface SkillRoutePlan {
  status: "blocked" | "needs_review" | "no_verified_provider" | "approval_required" | "manual_install_review";
  reasons: string[];
  skillId: string;
  selectedProviderId: string | null;
  pinnedSourceUrl: string | null;
  /** Even an eligible skill may never install or run automatically at this stage. */
  mayInstallAutomatically: false;
  mayExecuteAutomatically: false;
}

const SHA256 = /^[a-f0-9]{64}$/i;
const COMMIT = /^[a-f0-9]{40}$/i;
const ID = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
const MAX_FILES = 300;
const MAX_CONTENT_BYTES = 3_000_000;

function canonicalRepo(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "github.com" || u.hostname === "gitlab.com") &&
      !u.username && !u.password && !u.search && !u.hash && !u.port &&
      /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(u.pathname) &&
      !u.pathname.split("/").includes("..");
  } catch { return false; }
}
function safeRelativePath(path: string): boolean {
  return path.length > 0 && path.length <= 240 && !path.includes("\\") &&
    !path.startsWith("/") && !path.includes("//") && !/[\x00-\x1f]/.test(path) &&
    path.split("/").every(segment => segment !== "." && segment !== ".." && segment !== "");
}
function normalizedTokens(values: readonly string[]): string[] {
  return values.map(value => value.trim().toLowerCase()).filter(Boolean);
}

export function validateSkillDirectoryRecord(record: SkillDirectoryRecord): string[] {
  const reasons: string[] = [];
  if (!ID.test(record.id)) reasons.push("Unsafe skill identifier");
  if (!canonicalRepo(record.sourceUrl)) reasons.push("Untrusted or noncanonical repository URL");
  if (!safeRelativePath(record.skillPath)) reasons.push("Unsafe skill path");
  if (!record.sourceRevision || !COMMIT.test(record.sourceRevision)) reasons.push("Source commit not pinned");
  if (!record.manifestSha256 || !SHA256.test(record.manifestSha256)) reasons.push("Manifest digest not verified");
  if (!record.license?.trim()) reasons.push("License unknown");
  if (!record.domains.length || !record.supportedAgents.length) reasons.push("Capability claims incomplete");
  if ([...new Set(record.requestedPermissions)].length !== record.requestedPermissions.length ||
      record.requestedPermissions.some(p => !p.trim())) reasons.push("Invalid permission declarations");
  return reasons;
}

/** Finds potential skills using advertised metadata; never marks one trusted. */
export function recommendSkills(records: readonly SkillDirectoryRecord[], query: SkillDiscoveryQuery): SkillSuggestion[] {
  const tokens = normalizedTokens(query.keywords).slice(0, 16);
  return records.filter(record => record.domains.includes(query.domain) && record.supportedAgents.includes(query.agent))
    .map(record => {
      const haystack = [record.id, record.title, record.description, record.skillPath].join(" ").toLowerCase();
      const matches = tokens.filter(word => haystack.includes(word)).length;
      const missingTools = query.requiredTools.filter(tool => !record.advertisedTools.includes(tool));
      const cautions = validateSkillDirectoryRecord(record);
      if (missingTools.length) cautions.push("Tools not advertised: " + missingTools.join(", "));
      if (query.classification !== "public") cautions.push("Nonpublic data requires verified privacy clearance");
      return {
        record, score: (tokens.length ? matches / tokens.length : 0) * 10 +
          (missingTools.length ? 0 : 2) - cautions.length,
        status: "discovery_only" as const, cautions,
      };
    })
    .sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id));
}

/**
 * Detect dangling documentation dependencies and traversal out of the inspected
 * package. Repository-relative links and external resources are never assumed
 * audited: they must be resolved in a separate independent source review.
 */
function inspectDocumentationLinks(file: SkillTextFile, present: ReadonlySet<string>): SkillInspectionFinding[] {
  if (!/\.md$/i.test(file.path)) return [];
  const findings: SkillInspectionFinding[] = [];
  const markdownLink = /\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (const match of file.content.matchAll(markdownLink)) {
    const raw = match[1];
    if (/^(?:https?:\/\/|mailto:|#)/i.test(raw)) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("/")) {
      findings.push({ path: file.path, rule: "Unreviewed absolute documentation dependency", severity: "block" });
      continue;
    }
    let relative: string;
    try { relative = decodeURIComponent(raw.split(/[?#]/, 1)[0]); }
    catch { findings.push({ path: file.path, rule: "Malformed documentation link", severity: "block" }); continue; }
    const parts = file.path.split("/").slice(0, -1);
    let traversal = false;
    for (const segment of relative.split("/")) {
      if (segment === "." || segment === "") continue;
      if (segment === "..") {
        if (!parts.length) { traversal = true; break; }
        parts.pop();
      } else parts.push(segment);
    }
    const resolved = parts.join("/");
    if (traversal) {
      findings.push({ path: file.path, rule: "Reference escapes reviewed skill package: " + raw, severity: "block" });
    } else if (!present.has(resolved)) {
      findings.push({ path: file.path, rule: "Missing linked skill resource: " + raw, severity: "block" });
    }
  }
  return findings;
}

/**
 * Static triage over an explicitly supplied FULL file inventory.
 * This does not detect every prompt injection, malware or supply-chain risk.
 */
export function inspectSkillFiles(files: readonly SkillTextFile[], inventoryComplete: boolean): SkillInspection {
  const findings: SkillInspectionFinding[] = [];
  if (files.length === 0 || files.length > MAX_FILES) {
    findings.push({ path: "*", rule: "Invalid or excessive file count", severity: "block" });
  }
  const seen = new Set<string>();
  let totalBytes = 0;
  let manifestCount = 0;
  for (const file of files) {
    if (!safeRelativePath(file.path) || seen.has(file.path)) {
      findings.push({ path: file.path, rule: "Unsafe or duplicate package path", severity: "block" });
      continue;
    }
    seen.add(file.path);
    totalBytes += new TextEncoder().encode(file.content).length;
    if (file.path === "SKILL.md") manifestCount++;
    const checks: Array<[string, RegExp, InspectionSeverity]> = [
      ["Remote shell execution", /(?:curl|wget)[^\n]{0,300}\|\s*(?:sudo\s+)?(?:sh|bash)\b/i, "block"],
      ["Destructive command", /\brm\s+-[rRfF]{1,5}\s+\/(?:\s|$)/m, "block"],
      ["Instruction hierarchy override", /ignore (?:all )?(?:previous|prior|system) instructions|bypass (?:security|human )?approval/i, "block"],
      ["Secret access", /(?:process\.env|os\.environ|\.aws\/credentials|\.ssh\/id_|\bprintenv\b)/i, "review"],
      ["Network transmission", /(?:curl|wget)[^\n]{0,300}(?:--data|--upload-file|-X\s+POST)/i, "review"],
      ["Dynamic execution", /(?:child_process|subprocess|\beval\s*\(|\bexec\s*\()/i, "review"],
      ["Global package installation", /\b(?:npm|pnpm|yarn)\s+(?:install|add)\s+-g\b/i, "review"],
      ["Skill installer with automatic global confirmation", /\b(?:npx\s+)?skills\s+add[^\n]{0,160}(?:-g\b|--global|--yes|-y\b)/i, "review"],
    ];
    for (const [rule, pattern, severity] of checks) {
      if (pattern.test(file.content)) findings.push({ path: file.path, rule, severity });
    }
    if (/\.(?:sh|py|js|cjs|mjs|ts|ps1|bat)$/i.test(file.path)) {
      findings.push({ path: file.path, rule: "Executable source requires independent review", severity: "review" });
    }
  }
  for (const file of files) {
    if (seen.has(file.path)) findings.push(...inspectDocumentationLinks(file, seen));
  }
  if (manifestCount !== 1) findings.push({ path: "SKILL.md", rule: "Exactly one root SKILL.md required", severity: "block" });
  if (totalBytes > MAX_CONTENT_BYTES) findings.push({ path: "*", rule: "Skill source exceeds inspection limit", severity: "block" });
  if (!inventoryComplete) findings.push({ path: "*", rule: "Unverified file inventory completeness", severity: "block" });
  return {
    inventoryComplete, filesReviewed: files.length,
    staticCheckPassed: findings.length === 0,
    findings, humanReviewRequired: true,
  };
}

/**
 * Produces only an advisory plan. An approved result is not an installation,
 * a provider connection, or authority to run arbitrary skill instructions.
 */
export function planSkillRoute(input: {
  record: SkillDirectoryRecord;
  admission: ExternalSkillCandidate;
  inspection: SkillInspection;
  /** Read-only measured local package report; no direct installation. */
  sourceAudit: LocalSkillSourceAudit;
  binding: SkillRouteBinding;
  task: AICapabilityTask;
  providers: readonly AICapabilityProvider[];
}): SkillRoutePlan {
  const { record, admission, inspection, sourceAudit, binding, task, providers } = input;
  const base: Omit<SkillRoutePlan, "status" | "reasons"> = {
    skillId: record.id, selectedProviderId: null, pinnedSourceUrl: null,
    mayInstallAutomatically: false, mayExecuteAutomatically: false,
  };
  const blockers = validateSkillDirectoryRecord(record);
  if (record.id !== admission.provenance.id ||
      record.sourceUrl !== admission.provenance.sourceUrl ||
      record.sourceRevision !== admission.provenance.sourceRevision ||
      record.manifestSha256 !== admission.provenance.contentSha256 ||
      record.license !== admission.provenance.license) {
    blockers.push("Catalog metadata does not match reviewed provenance");
  }
  if (!record.domains.includes(task.domain)) blockers.push("Task domain not advertised");
  if (!record.supportedAgents.includes(binding.agent)) blockers.push("Agent not supported by skill");
  const catalogPermissions = new Set(record.requestedPermissions);
  const reviewedPermissions = new Set(admission.review.requestedPermissions);
  if (catalogPermissions.size !== reviewedPermissions.size ||
      [...catalogPermissions].some(permission => !reviewedPermissions.has(permission))) {
    blockers.push("Catalog skill permissions do not match reviewed requested permissions");
  }
  if (record.requestedPermissions.some(p => !admission.review.approvedPermissions.includes(p))) {
    blockers.push("Requested skill permissions are not approved");
  }
  if ((task.classification === "personal" || task.classification === "restricted") &&
      !admission.review.handlesPersonalData) blockers.push("Sensitive-data handling not reviewed");
  const acceptedInspection = new Set(admission.review.acknowledgedFindings ?? []);
  const pendingInspection = inspection.findings.filter(finding =>
    finding.severity !== "review" ||
    !acceptedInspection.has(finding.path + "::" + finding.rule));
  if (!inspection.inventoryComplete || pendingInspection.length > 0 ||
      (!inspection.staticCheckPassed && inspection.findings.length === 0) ||
      (inspection.findings.length > 0 &&
       (!admission.humanApproved || !admission.review.reviewedSource ||
        !admission.review.reviewerId?.trim()))) {
    blockers.push("Unreviewed or blocking static inspection finding");
  }
  if (inspection.filesReviewed !== sourceAudit.scannedFiles) {
    blockers.push("Source and static inspection file counts do not match");
  }
  const sourceDecision = assessLocalSkillSourceEvidence(record, admission, sourceAudit);
  if (!sourceDecision.verified) blockers.push(...sourceDecision.reasons);
  if (blockers.length) return { ...base, status: "blocked", reasons: blockers };
  const decision = assessSkillAdmission(admission);
  if (!decision.allowedToRegister) return {
    ...base, status: "needs_review", reasons: decision.reasons,
  };
  const chosen = providers.filter(p => p.id === binding.providerId);
  const route = routeAICapability({
    ...task,
    requiredTools: [...new Set([...task.requiredTools, ...record.advertisedTools])],
  }, chosen);
  if (!route.primary) return {
    ...base, status: "no_verified_provider",
    reasons: route.excluded.map(item => item.reason).length ?
      route.excluded.map(item => item.reason) : ["Provider not connected or verified"],
  };
  const pinnedSourceUrl = record.sourceUrl.replace(/\/$/, "") +
    "/tree/" + record.sourceRevision + "/" + record.skillPath;
  if (route.status === "approval_required") return {
    ...base, status: "approval_required", selectedProviderId: route.primary.id,
    pinnedSourceUrl, reasons: ["Task has an explicit approval gate"],
  };
  return { ...base, status: "manual_install_review",
    selectedProviderId: route.primary.id, pinnedSourceUrl,
    reasons: ["Source is eligible for a manual pinned-install review; no installation or execution performed"],
  };
}
