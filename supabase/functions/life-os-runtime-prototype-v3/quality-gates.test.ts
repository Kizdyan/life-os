import { describe, expect, it } from 'vitest';
import {
  approvePersonaCandidate,
  evidenceConfidenceCap,
  validEvidence,
  validatePersonaShootingBrief,
} from './quality-gates';

const now = Date.parse('2026-10-08T12:00:00Z');
const evidenceA = {
  source: 'Video research',
  finding: 'Documented format example',
  url: 'https://www.youtube.com/watch?v=abcdefghi12',
  asOf: '2026-10-07',
};
const evidenceB = {
  source: 'Audience research',
  finding: 'Documented feedback',
  url: 'https://www.instagram.com/reel/sample/',
  asOf: '2026-10-07',
};
const candidate = {
  id: 'approved-one', title: 'Actor micro-scene', angle: 'Real personal observation',
  format: 'reel', score: 90, confidence: 99,
  hook: 'An unexpected opening', script: 'A short shootable script',
  soloPlan: 'Phone fixed at eye level', estimatedMinutes: 8,
  estimatedDurationSeconds: 22,
  marketEvidence: [evidenceA, evidenceB],
  qualityVerdict: { verdict: 'APPROVE', score: 91 },
};
const shot = {
  id: 'shot-1', purpose: 'Opening', shotSize: 'medium-close', angle: 'eye level',
  cameraPosition: 'tripod', cameraHeight: 'eye level', distance: 'one meter',
  composition: 'center', movement: 'static', action: 'deliver hook',
  durationSeconds: 18, takes: 2, bRoll: false, bRollInstruction: null,
};
const brief = {
  title: 'Actor micro-scene', orientation: 'vertical', resolution: '4k', fps: 30,
  audio: 'quiet room', lighting: 'window from side', background: 'plain wall',
  shots: [shot], references: [],
};

describe('Persona prototype v3 server-side quality and shoot gates', () => {
  it('approves a shootable candidate but caps confidence by distinct structured evidence', () => {
    const result = approvePersonaCandidate(candidate, now);
    expect(result.approved).toBe(true);
    expect(result.candidate?.confidence).toBe(85);
    expect(evidenceConfidenceCap(0)).toBe(49);
    expect(evidenceConfidenceCap(1)).toBe(70);
    expect(evidenceConfidenceCap(3)).toBe(92);
  });

  it('rejects absent and fake-market evidence without claiming a verified trend', () => {
    const bad = [
      [],
      [{ ...evidenceA, url: 'http://www.youtube.com/watch?v=abcdefghi12' }],
      [{ ...evidenceA, url: 'https://example.com/fake' }],
      [{ ...evidenceA, url: 'https://127.0.0.1/private' }],
      [{ ...evidenceA, asOf: '2035-05-05' }],
    ];
    for (const marketEvidence of bad) {
      expect(approvePersonaCandidate({ ...candidate, marketEvidence }, now).approved).toBe(false);
    }
    expect(validEvidence({ ...evidenceA, asOf: '2026-02-30' }, now)).toBeNull();
  });

  it('does not raise confidence by duplicating a source', () => {
    const r = approvePersonaCandidate({ ...candidate, marketEvidence: [evidenceA, evidenceA] }, now);
    expect(r.approved).toBe(true);
    expect(r.candidate?.confidence).toBe(70);
  });

  it('fails closed for low quality, out-of-range production or unsupported format', () => {
    for (const override of [
      { qualityVerdict: { verdict: 'REVISE', score: 99 } },
      { qualityVerdict: { verdict: 'APPROVE', score: 79 } },
      { estimatedMinutes: 16 },
      { estimatedMinutes: 4 },
      { estimatedDurationSeconds: 31 },
      { estimatedDurationSeconds: 14 },
      { confidence: 42 },
      { hook: '' },
      { script: '' },
      { soloPlan: '' },
      { format: 'carousel' },
    ]) expect(approvePersonaCandidate({ ...candidate, ...override }, now).approved).toBe(false);
  });

  it('accepts a complete brief totaling 15 to 30 seconds', () => {
    expect(validatePersonaShootingBrief(brief)).toEqual([]);
  });

  it('rejects incomplete, too-short, too-long or impossible shooting briefs', () => {
    expect(validatePersonaShootingBrief({ ...brief, shots: [] })).toContain('shots');
    expect(validatePersonaShootingBrief({ ...brief, shots: [{ ...shot, durationSeconds: 7 }] }))
      .toContain('total_duration_seconds');
    expect(validatePersonaShootingBrief({ ...brief, shots: [shot, shot] }))
      .toContain('total_duration_seconds');
    expect(validatePersonaShootingBrief({ ...brief, shots: [{ ...shot, cameraPosition: '' }] }))
      .toContain('shots[0].cameraPosition');
    expect(validatePersonaShootingBrief({ ...brief, shots: [{ ...shot, bRoll: true }] }))
      .toContain('shots[0].bRollInstruction');
    expect(validatePersonaShootingBrief({ ...brief, orientation: 'landscape-ish' }))
      .toContain('orientation_value');
  });
});
