// Deterministic, fail-closed Persona V3 action gates.
// Structural URL checks are NOT independent verification of market claims.

type Dict = Record<string, unknown>;

export type Evidence = { source: string; finding: string; url: string; asOf: string };

const isDict = (v: unknown): v is Dict => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): string => typeof v === 'string' ? v.trim() : '';
const bounded = (v: unknown, lo: number, hi: number): number | null => {
  const n = typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};

export function validEvidence(raw: unknown, nowMs = Date.now()): Evidence | null {
  if (!isDict(raw)) return null;
  const source = text(raw.source), finding = text(raw.finding);
  const urlText = text(raw.url), asOf = text(raw.asOf);
  if (!source || !finding || !urlText || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return null;
  const asOfMs = Date.parse(asOf + 'T00:00:00Z');
  if (!Number.isFinite(asOfMs) || new Date(asOfMs).toISOString().slice(0, 10) !== asOf ||
      asOfMs > nowMs + 86_400_000) return null;
  try {
    const url = new URL(urlText);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || !host.includes('.') ||
        host === 'example.com' || host.endsWith('.example') || host.endsWith('.test') ||
        host.endsWith('.invalid') || host === 'localhost' || host.endsWith('.localhost') ||
        /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
    return { source, finding, url: url.href, asOf };
  } catch { return null; }
}

export function evidenceConfidenceCap(evidenceCount: number): number {
  if (evidenceCount < 1) return 49;
  if (evidenceCount === 1) return 70;
  if (evidenceCount === 2) return 85;
  return 92;
}

export function approvePersonaCandidate(candidate: unknown, nowMs = Date.now()):
  { approved: boolean; candidate: Dict | null; failures: string[] } {
  if (!isDict(candidate)) return { approved: false, candidate: null, failures: ['candidate'] };
  const issues: string[] = [];
  const verdict = isDict(candidate.qualityVerdict) ? candidate.qualityVerdict : {};
  if (text(verdict.verdict) !== 'APPROVE' || bounded(verdict.score, 80, 100) === null) issues.push('quality_verdict');
  if (!['reel', 'short'].includes(text(candidate.format))) issues.push('shoot_now_format');
  for (const key of ['id', 'title', 'angle', 'hook', 'script', 'soloPlan']) {
    if (!text(candidate[key])) issues.push(key);
  }
  if (bounded(candidate.estimatedMinutes, 5, 15) === null) issues.push('shoot_minutes');
  if (bounded(candidate.estimatedDurationSeconds, 15, 30) === null) issues.push('duration_seconds');
  const originalEvidence = Array.isArray(candidate.marketEvidence) ? candidate.marketEvidence : [];
  const byUrl = new Map<string, Evidence>();
  for (const item of originalEvidence) {
    const valid = validEvidence(item, nowMs);
    if (valid) byUrl.set(valid.url, valid);
  }
  const evidence = [...byUrl.values()];
  if (evidence.length === 0) issues.push('market_evidence');
  const reportedConfidence = bounded(candidate.confidence ?? candidate.score, 0, 100);
  if (reportedConfidence === null) issues.push('confidence');
  const cappedConfidence = Math.min(reportedConfidence ?? 0, evidenceConfidenceCap(evidence.length));
  if (cappedConfidence < 50) issues.push('confidence_evidence_cap');
  if (issues.length) return { approved: false, candidate: null, failures: issues };
  return {
    approved: true,
    candidate: { ...candidate, confidence: cappedConfidence, marketEvidence: evidence },
    failures: [],
  };
}

export function validatePersonaShootingBrief(brief: unknown): string[] {
  if (!isDict(brief)) return ['brief'];
  const issues: string[] = [];
  for (const key of ['title', 'orientation', 'resolution', 'audio', 'lighting', 'background']) {
    if (!text(brief[key])) issues.push(key);
  }
  if (!['vertical', 'horizontal'].includes(text(brief.orientation))) issues.push('orientation_value');
  if (!['1080p', '4k'].includes(text(brief.resolution))) issues.push('resolution_value');
  if (![24, 25, 30, 50, 60].includes(Number(brief.fps))) issues.push('fps');
  if (!Array.isArray(brief.references) || !brief.references.every((x) => typeof x === 'string')) issues.push('references');
  if (!Array.isArray(brief.shots) || brief.shots.length === 0) return [...issues, 'shots'];
  let total = 0;
  for (const [i, raw] of brief.shots.entries()) {
    if (!isDict(raw)) { issues.push('shots[' + i + ']'); continue; }
    for (const key of ['id','purpose','shotSize','angle','cameraPosition','cameraHeight',
      'distance','composition','movement','action']) {
      if (!text(raw[key])) issues.push('shots[' + i + '].' + key);
    }
    const duration = bounded(raw.durationSeconds, 2, 30);
    if (duration === null) issues.push('shots[' + i + '].durationSeconds');
    else total += duration;
    const takes = bounded(raw.takes, 1, 20);
    if (takes === null || !Number.isInteger(takes)) issues.push('shots[' + i + '].takes');
    if (raw.bRoll === true && !text(raw.bRollInstruction)) issues.push('shots[' + i + '].bRollInstruction');
  }
  if (total < 15 || total > 30) issues.push('total_duration_seconds');
  return issues;
}
