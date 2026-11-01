/**
 * Ruflo evaluation boundary for existing Life OS / Erika orchestrator.
 * This file NEVER installs, starts, grants permissions to, or calls Ruflo.
 * Its output is a reviewed experiment plan, not an authorization token.
 */
export type PilotDomain = 'engineering' | 'persona_video' | 'dive_m_research' | 'life_planning';
export type PilotDataClass = 'public' | 'internal' | 'personal' | 'restricted';
export type PilotRisk = 'read_only' | 'reversible' | 'external' | 'financial' | 'destructive' | 'security' | 'production';

export interface RufloPilotRequest {
  experimentId: string;
  domain: PilotDomain;
  dataClass: PilotDataClass;
  taskIds: string[];
  taskDescription: string;
  fixtureOnly: boolean;
  containsSecrets: boolean;
  networkRequested: boolean;
  writesToUserWorkspace: boolean;
  changesProduction: boolean;
  risks: PilotRisk[];
  independentObserverAssigned: boolean;
  ownerApprovedThirdPartyExecution: boolean;
  rollbackDocumented: boolean;
  maxEstimatedCostUsd: number;
  maxDurationSeconds: number;
}
export interface PilotDecision {
  status: 'blocked' | 'approval_required' | 'sandbox_ready';
  reasons: string[];
  mayExecute: false;
  /** Deliberately never a token for granting permission to external software. */
  approvedInstall: false;
  plannedTaskCount: number;
}

const ID = /^[a-z][a-z0-9-]{2,63}$/;
const RISKS: readonly PilotRisk[] = ['read_only','reversible','external','financial','destructive','security','production'];
const DOMAINS: readonly PilotDomain[] = ['engineering','persona_video','dive_m_research','life_planning'];
const DATA: readonly PilotDataClass[] = ['public','internal','personal','restricted'];

export function assessRufloPilotRequest(q: RufloPilotRequest): PilotDecision {
  const blocked: string[] = [];
  const approval: string[] = [];
  if (!ID.test(q.experimentId)) blocked.push('Invalid experiment id');
  if (!DOMAINS.includes(q.domain)) blocked.push('Unknown domain');
  if (!DATA.includes(q.dataClass)) blocked.push('Unknown data class');
  if (!Array.isArray(q.taskIds) || q.taskIds.length < 2 || q.taskIds.length > 3 ||
      q.taskIds.some(id => typeof id !== 'string' || !ID.test(id)) ||
      new Set(q.taskIds).size !== q.taskIds.length)
    blocked.push('Pilot needs 2–3 distinct independent task IDs');
  if (!q.taskDescription?.trim()) blocked.push('Task description required');
  if (!Array.isArray(q.risks) || q.risks.some(r=>!RISKS.includes(r))) blocked.push('Unknown risk');
  if (!q.fixtureOnly || q.dataClass !== 'public') blocked.push('Only synthetic/public fixtures are eligible');
  if (q.containsSecrets) blocked.push('Secrets must never be supplied as pilot data');
  if (q.writesToUserWorkspace || q.changesProduction)
    blocked.push('No writes to user workspace or production');
  if (q.networkRequested) approval.push('Network or provider egress needs separate explicit authorization');
  if (Array.isArray(q.risks) && q.risks.some(r=>['external','financial','destructive','security','production'].includes(r)))
    blocked.push('Elevated or external-effect risks are excluded from sandbox');
  if (!q.independentObserverAssigned) blocked.push('Independent Observer required');
  if (!q.rollbackDocumented) blocked.push('Rollback procedure required');
  if (!Number.isFinite(q.maxEstimatedCostUsd) || q.maxEstimatedCostUsd < 0 || q.maxEstimatedCostUsd > 5)
    blocked.push('Pilot cost cap must be 0–5 USD');
  if (!Number.isSafeInteger(q.maxDurationSeconds) || q.maxDurationSeconds < 1 || q.maxDurationSeconds > 600)
    blocked.push('Pilot must be bounded to 1–600 seconds');
  if (!q.ownerApprovedThirdPartyExecution) approval.push('Third-party runtime execution requires owner approval');
  return {
    status: blocked.length ? 'blocked' : approval.length ? 'approval_required' : 'sandbox_ready',
    reasons: [...blocked, ...approval],
    mayExecute: false, approvedInstall: false,
    plannedTaskCount: Array.isArray(q.taskIds) ? q.taskIds.length : 0,
  };
}

export interface TrialMeasurements {
  runId: string;
  independentObserver: string;
  sourceSnapshotSha256: string;
  outputEvidenceSha256: string;
  measured: boolean;
  testCases: number;
  passedCases: number;
  criticalDefects: number;
  elapsedSeconds: number;
  costUsd: number;
  tokens: number | null;
}
export interface RufloComparison {
  decision: 'reject' | 'insufficient_evidence' | 'worth_expanding';
  reasons: string[];
  baselinePassRate: number | null;
  pilotPassRate: number | null;
  timeChangePct: number | null;
  costChangePct: number | null;
  productionApproved: false;
}
const HASH = /^[a-f0-9]{64}$/i;
function valid(m: TrialMeasurements): boolean {
  return Boolean(m && m.runId?.trim() && m.independentObserver?.trim() &&
    HASH.test(m.sourceSnapshotSha256) && HASH.test(m.outputEvidenceSha256) &&
    m.measured === true && Number.isSafeInteger(m.testCases) && m.testCases >= 3 &&
    Number.isSafeInteger(m.passedCases) && m.passedCases >= 0 && m.passedCases <= m.testCases &&
    Number.isSafeInteger(m.criticalDefects) && m.criticalDefects >= 0 &&
    Number.isFinite(m.elapsedSeconds) && m.elapsedSeconds > 0 &&
    Number.isFinite(m.costUsd) && m.costUsd >= 0 &&
    (m.tokens === null || (Number.isSafeInteger(m.tokens) && m.tokens >= 0)));
}
/** Compare equal tasks/fixtures only. No outcome authorizes a production deployment. */
export function evaluateRufloAgainstBaseline(baseline: TrialMeasurements, pilot: TrialMeasurements): RufloComparison {
  const reasons: string[] = [];
  const empty = (decision: RufloComparison['decision']): RufloComparison => ({
    decision, reasons, baselinePassRate: null, pilotPassRate: null,
    timeChangePct: null, costChangePct: null, productionApproved: false,
  });
  if (!valid(baseline) || !valid(pilot)) {
    reasons.push('Independent measured evidence, SHA-256 artifacts and at least three tests required');
    return empty('insufficient_evidence');
  }
  if (baseline.sourceSnapshotSha256 !== pilot.sourceSnapshotSha256 ||
      baseline.testCases !== pilot.testCases) {
    reasons.push('Baseline and pilot must use identical fixture snapshot and test count');
    return empty('insufficient_evidence');
  }
  if (baseline.runId === pilot.runId || baseline.independentObserver === pilot.runId ||
      pilot.independentObserver === pilot.runId) {
    reasons.push('Independent runs and observers required');
    return empty('insufficient_evidence');
  }
  const b = baseline.passedCases / baseline.testCases;
  const p = pilot.passedCases / pilot.testCases;
  const time = (pilot.elapsedSeconds / baseline.elapsedSeconds - 1) * 100;
  const cost = baseline.costUsd === 0 ? null : (pilot.costUsd / baseline.costUsd - 1) * 100;
  if (pilot.criticalDefects || pilot.passedCases < baseline.passedCases) {
    reasons.push('Pilot has critical defects or lower test pass rate');
    return { decision:'reject', reasons, baselinePassRate:b, pilotPassRate:p,
      timeChangePct:time, costChangePct:cost, productionApproved:false };
  }
  const improved = p > b || time <= -10 || (cost !== null && cost <= -10);
  if (!improved) reasons.push('No >=10% speed/cost gain or quality improvement over baseline');
  if (pilot.costUsd > 5) reasons.push('Cost exceeds maximum sandbox budget');
  return { decision: improved && pilot.costUsd <= 5 ? 'worth_expanding' : 'reject', reasons,
    baselinePassRate:b, pilotPassRate:p, timeChangePct:time, costChangePct:cost,
    productionApproved:false };
}