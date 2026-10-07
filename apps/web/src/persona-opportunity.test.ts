import { describe, expect, it } from 'vitest';
import {
  effectivePersonaConfidence,
  ideaClearsQualityBar,
  marketEvidenceConfidenceCap,
  normalizePersonaRecommendationPayload,
} from './persona-opportunity';

const strong = {
  id: 'idea-1',
  title: 'Актёр может идеально сделать работу и не получить работу',
  angle: 'Личное наблюдение об отказах без экспертной позы',
  format: 'reel' as const,
  score: 88,
  confidence: 82,
  hook: 'Актёр — одна из немногих профессий, где можно идеально сделать работу и всё равно не получить работу.',
  script: 'Короткий разговорный текст, рассчитанный примерно на двадцать секунд спокойной речи в кадре.',
  estimatedMinutes: 8,
  estimatedDurationSeconds: 22,
  soloPlan: 'Один master + два B-roll.',
  marketEvidence: [
    { source: 'source-a', finding: 'наблюдение A', url: 'https://example.com/a', asOf: '2026-10-07' },
    { source: 'source-b', finding: 'наблюдение B', url: 'https://example.com/b', asOf: '2026-10-07' },
  ],
  qualityVerdict: { verdict: 'APPROVE' as const, score: 89, summary: 'Сильный личный угол', risks: [] },
};

describe('Persona opportunity quality gate', () => {
  it('accepts only a fully reviewed, evidenced and shootable recommendation', () => {
    expect(ideaClearsQualityBar(strong)).toBe(true);
  });

  it('deterministically caps confidence by verified market evidence', () => {
    expect(marketEvidenceConfidenceCap({ ...strong, marketEvidence: [] })).toBe(49);
    expect(effectivePersonaConfidence({ ...strong, confidence: 95, marketEvidence: [strong.marketEvidence[0]] })).toBe(70);
    expect(effectivePersonaConfidence(strong)).toBe(82);
  });

  it('rejects weak, unreviewed, unevidenced or out-of-bounds recommendations', () => {
    expect(ideaClearsQualityBar({ ...strong, qualityVerdict: { ...strong.qualityVerdict, score: 79 } })).toBe(false);
    expect(ideaClearsQualityBar({ ...strong, confidence: 42 })).toBe(false);
    expect(ideaClearsQualityBar({ ...strong, marketEvidence: [] })).toBe(false);
    expect(ideaClearsQualityBar({ ...strong, hook: '' })).toBe(false);
    expect(ideaClearsQualityBar({ ...strong, estimatedMinutes: 16 })).toBe(false);
    expect(ideaClearsQualityBar({ ...strong, estimatedDurationSeconds: 31 })).toBe(false);
    expect(ideaClearsQualityBar({ ...strong, estimatedDurationSeconds: 14 })).toBe(false);
  });

  it('keeps at most one quality-cleared alternative and exposes capped confidence', () => {
    const result = normalizePersonaRecommendationPayload({
      recommendation: strong,
      alternatives: [
        { ...strong, id: 'alt-1', title: 'Alt 1' },
        { ...strong, id: 'alt-2', title: 'Alt 2' },
      ],
      analysisSummary: 'court passed',
    });
    expect(result.recommendation?.id).toBe('idea-1');
    expect(result.recommendation?.confidence).toBe(82);
    expect(result.alternatives).toHaveLength(1);
    expect(result.analysisSummary).toBe('court passed');
  });
});
