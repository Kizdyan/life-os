import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const entry = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const gates = readFileSync(new URL('./quality-gates.ts', import.meta.url), 'utf8');
const brain = readFileSync(new URL('./persona-brain.ts', import.meta.url), 'utf8');

describe('prototype v3 fail-closed quality contract', () => {
  it('requires current approval plus HMAC verification before any paid-free shooting', () => {
    expect(entry).toContain('pickApprovedBrain(combined, signingSecret');
    expect(entry).toContain('sealApprovedIdea(checked.candidate, signingSecret)');
    expect(entry).toContain('verifyApproval(payload.approvalProof');
    expect(brain).toContain('crypto.subtle.verify');
  });

  it('enforces score, evidence confidence, minutes and duration', () => {
    expect(gates).toContain('bounded(verdict.score, 80, 100)');
    expect(gates).toContain('bounded(candidate.estimatedMinutes, 5, 15)');
    expect(gates).toContain('bounded(candidate.estimatedDurationSeconds, 15, 30)');
    expect(gates).toContain('evidenceConfidenceCap(evidence.length)');
    expect(entry).toContain('approvePersonaCandidate(item)');
  });

  it('builds a deterministic, complete shooting brief without an AI call', () => {
    expect(entry).toContain('buildDeterministicShootingBrief(approved.idea)');
    expect(brain).toContain('validatePersonaShootingBrief(brief)');
    expect(entry).toContain('idea_approval_required');
  });
});
