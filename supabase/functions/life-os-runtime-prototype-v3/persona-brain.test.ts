import { describe, expect, it } from 'vitest';
import { approvePersonaCandidate, validatePersonaShootingBrief } from './quality-gates';
import {
  APPROVAL_TTL_MS, EVIDENCE_TTL_MS, approvalFreshness, buildDeterministicShootingBrief,
  isActionableApproval, pickApprovedBrain, sealApprovedIdea, verifyApproval,
} from './persona-brain';

const date = Date.parse('2026-10-08T12:00:00.000Z');
const secret = 'unit-test-nonproduction-dummy-secret';
const validCandidate = {
  id: 'actor-1', title: 'Минутный закулисный момент',
  angle: 'Личное наблюдение без экспертной позы', format: 'reel',
  score: 91, confidence: 89, hook: 'Маленький секрет сцены',
  script: 'Показываю один реальный момент перед началом спектакля',
  soloPlan: 'Один дубль, iPhone на опоре', estimatedMinutes: 8,
  estimatedDurationSeconds: 22,
  marketEvidence: [
    { source: 'Source A', finding: 'Format observation A',
      url: 'https://www.youtube.com/watch?v=sample_one', asOf: '2026-10-07' },
    { source: 'Source B', finding: 'Format observation B',
      url: 'https://www.instagram.com/reel/sample_two/', asOf: '2026-10-07' },
  ],
  qualityVerdict: { verdict: 'APPROVE', score: 89, summary: 'Выполнимо', risks: [] },
};

describe('Persona V3 offline approval cache and deterministic shooting', () => {
  it('seals only deterministic approved evidence and validates signed cache without AI', async () => {
    expect(approvePersonaCandidate(validCandidate, date).approved).toBe(true);
    const issued = await sealApprovedIdea(validCandidate, secret, date);
    expect(issued.idea.confidence).toBe(85);
    expect(issued.freshness).toBe('cached');
    const restored = await verifyApproval(issued.approvalProof, secret, date);
    expect(restored?.idea.id).toBe('actor-1');
    expect(restored?.freshness).toBe('cached');
    expect(issued.approvalProof).not.toContain(secret);
  });

  it('rejects unsigned, tampered, cross-secret and expired approvals', async () => {
    const issued = await sealApprovedIdea(validCandidate, secret, date);
    expect(await verifyApproval('', secret, date)).toBeNull();
    expect(await verifyApproval(issued.approvalProof.slice(1), secret, date)).toBeNull();
    expect(await verifyApproval(issued.approvalProof, 'different-signing-key', date)).toBeNull();
    expect(await verifyApproval(issued.approvalProof, secret, date + APPROVAL_TTL_MS + 60_000)).toBeNull();
  });

  it('does not label stale cached market evidence as fresh research', async () => {
    const issued = await sealApprovedIdea(validCandidate, secret, date);
    const aged = await verifyApproval(issued.approvalProof, secret, date + EVIDENCE_TTL_MS + 2 * 86_400_000);
    expect(aged?.freshness).toBe('stale');
    expect(approvalFreshness(issued.approvedAt, issued.evidenceCheckedAt, date)).toBe('cached');
    expect(approvalFreshness(issued.approvedAt, issued.evidenceCheckedAt,
      date + APPROVAL_TTL_MS + 60_000)).toBe('expired');
    expect(isActionableApproval(aged)).toBe(false);
    expect(isActionableApproval(await verifyApproval(issued.approvalProof, secret, date))).toBe(true);
  });

  it('reuses a current approved idea before stale one, ignores rejected history', async () => {
    const sealed = await sealApprovedIdea(validCandidate, secret, date);
    const entry = { approvalProof: sealed.approvalProof };
    expect((await pickApprovedBrain([entry], secret, [], date))?.idea.id).toBe('actor-1');
    expect(await pickApprovedBrain([entry], secret,
      [{ title: validCandidate.title, status: 'rejected' }], date)).toBeNull();
    expect(await pickApprovedBrain([{ approvalProof: 'forged' }], secret, [], date)).toBeNull();
  });

  it('creates a fully validated 22-second shooting brief from signed approved idea without AI', async () => {
    const signed = await sealApprovedIdea(validCandidate, secret, date);
    const verified = await verifyApproval(signed.approvalProof, secret, date);
    if (!verified) throw new Error('test fixture did not verify');
    const brief = buildDeterministicShootingBrief(verified.idea);
    expect(validatePersonaShootingBrief(brief)).toEqual([]);
    expect((brief.shots as Array<{ durationSeconds: number }>)[0].durationSeconds).toBe(22);
    expect((brief.shots as Array<{ dialogue: string }>)[0].dialogue).toContain(validCandidate.script);
  });

  it('refuses to approve fresh ideas whose evidence has already gone stale', async () => {
    const oldEvidence = validCandidate.marketEvidence.map(e => ({ ...e, asOf: '2026-09-01' }));
    await expect(sealApprovedIdea({ ...validCandidate, marketEvidence: oldEvidence }, secret, date))
      .rejects.toThrow('market_evidence_too_old_to_approve');
  });
});
