import type { PersonaIdea, PersonaMarketEvidence } from './personaIdeaState';

export interface PersonaRecommendationPayload {
  recommendation: PersonaIdea | null;
  alternatives: PersonaIdea[];
  analysisSummary: string;
}

function finitePercent(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

function hasWellFormedEvidence(item: PersonaMarketEvidence | null | undefined): boolean {
  if (!item?.source?.trim() || !item.finding?.trim() || !item.url?.trim() || !item.asOf?.trim()) return false;
  try {
    const url = new URL(item.url);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    if (!host.includes('.') || host === 'example.com' || host.endsWith('.example') ||
        host.endsWith('.test') || host.endsWith('.invalid') || host.endsWith('.localhost') ||
        host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
    const date = item.asOf.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(date + 'T00:00:00Z');
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date &&
      parsed.getTime() <= Date.now() + 86_400_000;
  } catch {
    return false;
  }
}

// Schema validation only: this does not independently verify that a market claim is true.
function verifiedMarketEvidence(items: PersonaMarketEvidence[] | undefined): PersonaMarketEvidence[] {
  return (items ?? []).filter(hasWellFormedEvidence);
}

export function marketEvidenceConfidenceCap(idea: PersonaIdea): number {
  const count = verifiedMarketEvidence(idea.marketEvidence).length;
  if (count === 0) return 49;
  if (count === 1) return 70;
  if (count === 2) return 85;
  return 92;
}

export function effectivePersonaConfidence(idea: PersonaIdea): number | null {
  const reported = finitePercent(idea.confidence ?? idea.score);
  if (reported === null) return null;
  return Math.min(reported, marketEvidenceConfidenceCap(idea));
}

export function ideaClearsQualityBar(value: unknown): value is PersonaIdea {
  if (!value || typeof value !== 'object') return false;
  const idea = value as PersonaIdea;
  if (!idea.id?.trim() || !idea.title?.trim() || !idea.angle?.trim()) return false;
  if (!['carousel', 'photo', 'reel', 'short', 'story'].includes(idea.format)) return false;

  const confidence = effectivePersonaConfidence(idea);
  const verdictScore = finitePercent(idea.qualityVerdict?.score);
  if (confidence === null || confidence < 50) return false;
  if (idea.qualityVerdict?.verdict !== 'APPROVE' || verdictScore === null || verdictScore < 80) return false;

  if (idea.format === 'reel' || idea.format === 'short') {
    if (!idea.hook?.trim() || !idea.script?.trim() || !idea.soloPlan?.trim()) return false;
    const shootMinutes = Number(idea.estimatedMinutes);
    if (!Number.isFinite(shootMinutes) || shootMinutes < 5 || shootMinutes > 15) return false;
    const durationSeconds = Number(idea.estimatedDurationSeconds);
    if (!Number.isFinite(durationSeconds) || durationSeconds < 15 || durationSeconds > 30) return false;
  }
  return true;
}

function normalizeIdea(idea: PersonaIdea): PersonaIdea {
  const confidence = effectivePersonaConfidence(idea);
  return confidence === null ? idea : { ...idea, confidence };
}

export function normalizePersonaRecommendationPayload(value: unknown): PersonaRecommendationPayload {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const rawRecommendation = data.recommendation;
  const recommendation = ideaClearsQualityBar(rawRecommendation) ? normalizeIdea(rawRecommendation) : null;
  const alternatives = Array.isArray(data.alternatives)
    ? data.alternatives.filter(ideaClearsQualityBar).map(normalizeIdea).slice(0, 1)
    : [];
  return {
    recommendation,
    alternatives,
    analysisSummary: typeof data.analysisSummary === 'string' ? data.analysisSummary.trim() : '',
  };
}

/**
 * Only a newly approved runtime recommendation can become actionable.
 * Local fallback and previously persisted suggestions are never authoritative.
 */
export function selectActionablePersonaIdeas(
  approvedFromCurrentRun: PersonaIdea[],
  history: ReadonlyArray<{ title: string; status: string }>,
): PersonaIdea[] {
  const blocked = new Set(
    history.filter((entry) => ['used', 'rejected', 'later'].includes(entry.status))
      .map((entry) => entry.title.trim().toLocaleLowerCase('ru-RU')),
  );
  return approvedFromCurrentRun
    .filter((idea) => ideaClearsQualityBar(idea) &&
      !blocked.has(idea.title.trim().toLocaleLowerCase('ru-RU')))
    .map(normalizeIdea);
}
