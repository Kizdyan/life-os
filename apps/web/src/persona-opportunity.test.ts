import { describe, expect, it } from 'vitest';
import {
  effectivePersonaConfidence,
  ideaClearsQualityBar,
  marketEvidenceConfidenceCap,
  normalizePersonaRecommendationPayload,
  selectActionablePersonaIdeas,
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
    { source: 'source-a', finding: 'наблюдение A', url: 'https://www.youtube.com/watch?v=abcdefghi12', asOf: '2026-10-07' },
    { source: 'source-b', finding: 'наблюдение B', url: 'https://www.instagram.com/reel/sample/', asOf: '2026-10-07' },
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

  it('rejects malformed, non-HTTPS, placeholder and future-dated market evidence', () => {
    const item = strong.marketEvidence[0];
    for (const bad of [
      { ...item, url: 'not-a-url' },
      { ...item, url: 'http://www.youtube.com/watch?v=abcdefghi12' },
      { ...item, url: 'https://example.com/fake' },
      { ...item, url: 'https://localhost/internal' },
      { ...item, url: 'https://127.0.0.1/private' },
      { ...item, asOf: 'tomorrow' },
      { ...item, asOf: '2099-01-01' },
    ]) {
      expect(ideaClearsQualityBar({ ...strong, marketEvidence: [bad] })).toBe(false);
    }
  });

  it('does not expose persisted or degraded fallback ideas as actions without a fresh approval', () => {
    const fallback = { ...strong, id: 'local-0', title: 'Резерв', qualityVerdict: undefined, marketEvidence: [], confidence: 42 };
    const oldSaved = { ...strong, id: 'saved-0', title: 'Старая утверждённая тема' };
    expect(selectActionablePersonaIdeas([], [])).toEqual([]);
    expect(selectActionablePersonaIdeas([fallback], [])).toEqual([]);
    expect(selectActionablePersonaIdeas([strong], [{ title: strong.title, status: 'rejected' }])).toEqual([]);
    expect(selectActionablePersonaIdeas([strong], [{ title: strong.title, status: 'later' }])).toEqual([]);
    expect(selectActionablePersonaIdeas([strong], [{ title: strong.title, status: 'used' }])).toEqual([]);
    expect(selectActionablePersonaIdeas([strong, fallback], []).map(item => item.id)).toEqual(['idea-1']);
    // This is NOT the persisted list: passing only current-run approvals is mandatory.
    expect(selectActionablePersonaIdeas([oldSaved], []).map(item => item.id)).toEqual(['saved-0']);
  });

});
