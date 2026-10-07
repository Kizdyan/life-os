import type { PersonaIdea } from './personaIdeaState';

export interface PersonaRecommendationPayload {
  recommendation: PersonaIdea | null;
  alternatives: PersonaIdea[];
  analysisSummary: string;
}

function finitePercent(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

export function ideaClearsQualityBar(value: unknown): value is PersonaIdea {
  if (!value || typeof value !== 'object') return false;
  const idea = value as PersonaIdea;
  if (!idea.id?.trim() || !idea.title?.trim() || !idea.angle?.trim()) return false;
  if (!['carousel', 'photo', 'reel', 'short', 'story'].includes(idea.format)) return false;

  const confidence = finitePercent(idea.confidence ?? idea.score);
  const verdictScore = finitePercent(idea.qualityVerdict?.score);
  if (confidence === null || confidence < 50) return false;
  if (idea.qualityVerdict?.verdict !== 'APPROVE' || verdictScore === null || verdictScore < 80) return false;

  if (idea.format === 'reel' || idea.format === 'short') {
    if (!idea.hook?.trim() || !idea.script?.trim() || !idea.soloPlan?.trim()) return false;
    if (!Number.isFinite(Number(idea.estimatedMinutes)) || Number(idea.estimatedMinutes) <= 0 || Number(idea.estimatedMinutes) > 20) return false;
  }
  return true;
}

export function normalizePersonaRecommendationPayload(value: unknown): PersonaRecommendationPayload {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const recommendation = ideaClearsQualityBar(data.recommendation) ? data.recommendation : null;
  const alternatives = Array.isArray(data.alternatives)
    ? data.alternatives.filter(ideaClearsQualityBar).slice(0, 1)
    : [];
  return {
    recommendation,
    alternatives,
    analysisSummary: typeof data.analysisSummary === 'string' ? data.analysisSummary.trim() : '',
  };
}
