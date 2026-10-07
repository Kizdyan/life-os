import { describe, expect, it } from 'vitest';
import { ideaClearsQualityBar, normalizePersonaRecommendationPayload } from './persona-opportunity';

const strong = {
  id: 'idea-1',
  title: 'Актёр может идеально сделать работу и не получить работу',
  angle: 'Личное наблюдение об отказах без экспертной позы',
  format: 'reel' as const,
  score: 88,
  confidence: 82,
  hook: 'Актёр — одна из немногих профессий, где можно идеально сделать работу и всё равно не получить работу.',
  script: 'Короткий текст.',
  estimatedMinutes: 8,
  soloPlan: 'Один master + два B-roll.',
  qualityVerdict: { verdict: 'APPROVE' as const, score: 89, summary: 'Сильный личный угол', risks: [] },
};

describe('Persona opportunity quality gate', () => {
  it('accepts only a fully reviewed shootable recommendation', () => {
    expect(ideaClearsQualityBar(strong)).toBe(true);
  });

  it('rejects weak or unreviewed recommendations instead of showing false confidence', () => {
    expect(ideaClearsQualityBar({ ...strong, qualityVerdict: { ...strong.qualityVerdict, score: 79 } })).toBe(false);
    expect(ideaClearsQualityBar({ ...strong, confidence: 42 })).toBe(false);
    expect(ideaClearsQualityBar({ ...strong, hook: '' })).toBe(false);
  });

  it('keeps at most one quality-cleared alternative', () => {
    const result = normalizePersonaRecommendationPayload({
      recommendation: strong,
      alternatives: [
        { ...strong, id: 'alt-1', title: 'Alt 1' },
        { ...strong, id: 'alt-2', title: 'Alt 2' },
      ],
      analysisSummary: 'court passed',
    });
    expect(result.recommendation?.id).toBe('idea-1');
    expect(result.alternatives).toHaveLength(1);
    expect(result.analysisSummary).toBe('court passed');
  });
});
