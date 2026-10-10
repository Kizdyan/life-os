import { approvePersonaCandidate, validatePersonaShootingBrief } from "./quality-gates.ts";

type Dict = Record<string, unknown>;
export const EVIDENCE_TTL_MS = 7 * 86_400_000;
// Static format guidance is not a time-sensitive market trend. It has its own
// bounded review window; the original evidence date never moves forward.
export const FORMAT_GUIDANCE_TTL_MS = 180 * 86_400_000;
export const APPROVAL_TTL_MS = 30 * 86_400_000;
export type IntelligenceFreshness = "cached" | "stale";

export interface SealedApproval {
  idea: Dict;
  approvedAt: string;
  evidenceCheckedAt: string;
  approvalProof: string;
  freshness?: IntelligenceFreshness;
}

export function isActionableApproval(approval: SealedApproval | null): approval is SealedApproval {
  return approval?.freshness === "cached";
}

export function evidenceReviewWindowMs(idea: unknown): number {
  if (!idea || typeof idea !== "object" || Array.isArray(idea)) return EVIDENCE_TTL_MS;
  const candidate = idea as Dict;
  if (candidate.evidenceKind !== "EDITORIAL_PLATFORM_GUIDANCE_NOT_LIVE_TREND" ||
      !/^(?:HUMAN_EDITORIAL_CURATED|CURATED_FREE_ONLY)_2026-10-08/.test(String(candidate.reviewProvenance||"")))
    return EVIDENCE_TTL_MS;
  const sources = Array.isArray(candidate.marketEvidence) ? candidate.marketEvidence : [];
  if (sources.length<2) return EVIDENCE_TTL_MS;
  // A lookalike, redirector, personal blog, or user-submitted trend source
  // never inherits evergreen formatting status.
  const official = new Set(["www.facebook.com","facebook.com","blog.youtube"]);
  if (!sources.every(source=>{
    try {
      const url=new URL(String(source?.url||""));
      return url.protocol==="https:"&&!url.username&&!url.password&&official.has(url.hostname.toLowerCase());
    } catch {return false;}
  })) return EVIDENCE_TTL_MS;
  return FORMAT_GUIDANCE_TTL_MS;
}

const encoder = new TextEncoder();
function b64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unB64Url(data: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(data)) throw new Error("invalid_approval_encoding");
  const binary = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, x => x.charCodeAt(0));
}
async function approvalKey(secret: string): Promise<CryptoKey> {
  if (!secret) throw new Error("approval_signing_not_configured");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode("persona-v3-approval-v1:" + secret));
  return crypto.subtle.importKey("raw", digest, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
function earliestEvidenceDate(idea: Dict): number {
  const items = Array.isArray(idea.marketEvidence) ? idea.marketEvidence : [];
  const dates = items.map((e: any) => Date.parse(String(e?.asOf ?? "") + "T00:00:00Z"))
    .filter((n: number) => Number.isFinite(n));
  return dates.length === items.length && dates.length > 0 ? Math.min(...dates) : NaN;
}
export function approvalFreshness(
  approvedAt: string, evidenceCheckedAt: string, now = Date.now(),
  evidenceMaxAgeMs = EVIDENCE_TTL_MS,
): "cached" | "stale" | "expired" {
  const approved = Date.parse(approvedAt), evidence = Date.parse(evidenceCheckedAt);
  if (!Number.isFinite(approved) || !Number.isFinite(evidence) ||
      approved > now + 60_000 || evidence > now + 86_400_000 ||
      approved < now - APPROVAL_TTL_MS) return "expired";
  return evidence < now - evidenceMaxAgeMs ? "stale" : "cached";
}

export async function sealApprovedIdea(idea: unknown, secret: string, now = Date.now()):
  Promise<SealedApproval> {
  const checked = approvePersonaCandidate(idea, now);
  if (!checked.approved || !checked.candidate) throw new Error("idea_quality_not_approved");
  const timestamp = earliestEvidenceDate(checked.candidate);
  if (!Number.isFinite(timestamp) || timestamp < now - evidenceReviewWindowMs(checked.candidate)) {
    throw new Error("market_evidence_too_old_to_approve");
  }
  const envelope = {
    version: 1,
    idea: checked.candidate,
    approvedAt: new Date(now).toISOString(),
    evidenceCheckedAt: new Date(timestamp).toISOString(),
  };
  const encoded = b64Url(encoder.encode(JSON.stringify(envelope)));
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await approvalKey(secret), encoder.encode(encoded)));
  return { idea: checked.candidate, approvedAt: envelope.approvedAt,
    evidenceCheckedAt: envelope.evidenceCheckedAt,
    approvalProof: encoded + "." + b64Url(signature), freshness: "cached" };
}

export async function verifyApproval(proof: unknown, secret: string, now = Date.now()):
  Promise<SealedApproval | null> {
  if (typeof proof !== "string" || proof.length > 40_000 || proof.length < 60) return null;
  try {
    const parts = proof.split(".");
    if (parts.length !== 2) return null;
    const valid = await crypto.subtle.verify(
      "HMAC", await approvalKey(secret), unB64Url(parts[1]), encoder.encode(parts[0]));
    if (!valid) return null;
    const value = JSON.parse(new TextDecoder().decode(unB64Url(parts[0]))) as Record<string, unknown>;
    if (value.version !== 1 || typeof value.approvedAt !== "string" ||
        typeof value.evidenceCheckedAt !== "string") return null;
    const fresh = approvalFreshness(value.approvedAt, value.evidenceCheckedAt, now,
      evidenceReviewWindowMs(value.idea));
    if (fresh === "expired") return null;
    const checked = approvePersonaCandidate(value.idea, now);
    if (!checked.approved || !checked.candidate) return null;
    // The only approved fields come from the signed server envelope.
    return { idea: checked.candidate, approvedAt: value.approvedAt,
      evidenceCheckedAt: value.evidenceCheckedAt, approvalProof: proof, freshness: fresh };
  } catch {
    return null;
  }
}

export function buildDeterministicShootingBrief(idea: Dict): Record<string, unknown> {
  const duration = Number(idea.estimatedDurationSeconds);
  const title = String(idea.title ?? "").trim(), hook = String(idea.hook ?? "").trim();
  const script = String(idea.script ?? "").trim();
  const brief: Record<string, unknown> = {
    title, orientation: "vertical", resolution: "4k", fps: 30,
    audio: "Запиши голос в тихом помещении; проверь уровень и отсутствие шума.",
    lighting: "Встань лицом к мягкому свету окна, избегай контрового света.",
    background: "Нейтральный аккуратный фон без лишних предметов и чужих лиц.",
    references: [],
    shots: [{
      id: "master-1", purpose: "Хук и история одним непрерывным дублем",
      shotSize: "medium-close", angle: "На уровне глаз", cameraPosition: "iPhone на устойчивой опоре",
      cameraHeight: "На уровне глаз", distance: "Около метра",
      composition: "Глаза в верхней трети, место для субтитров снизу",
      movement: "Статичная камера",
      durationSeconds: duration, takes: 2,
      action: "Сначала произнеси хук, затем текст. " + String(idea.soloPlan ?? ""),
      dialogue: hook + "\n" + script,
      bRoll: false, bRollInstruction: null,
    }],
  };
  const failures = validatePersonaShootingBrief(brief);
  if (failures.length) throw new Error("deterministic_brief_failed:" + failures.join(","));
  return brief;
}

export async function pickApprovedBrain(
  entries: unknown, secret: string, history: unknown, now = Date.now(),
): Promise<SealedApproval | null> {
  if (!Array.isArray(entries)) return null;
  const blocked = new Set(
    Array.isArray(history) ? history.filter((x): x is Dict => x !== null && typeof x === "object")
      .filter(x => ["used", "rejected", "later"].includes(String(x.status)))
      .map(x => String(x.title ?? "").trim().toLocaleLowerCase("ru-RU")) : []);
  let stale: SealedApproval | null = null;
  for (const raw of entries.slice(0, 8)) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Dict;
    const approved = await verifyApproval(entry.approvalProof, secret, now);
    if (!approved || blocked.has(String(approved.idea.title ?? "").trim().toLocaleLowerCase("ru-RU"))) continue;
    if (approved.freshness === "cached") return approved;
    if (!stale) stale = approved;
  }
  return stale;
}
