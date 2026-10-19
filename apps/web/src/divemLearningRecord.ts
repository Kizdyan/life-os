export type LearningStatus = "VERIFIED" | "OBSERVATION" | "HYPOTHESIS";

export interface VerifiedLearningRecord {
  id: string;
  product: "DIVEM";
  problem: string;
  baseline: string;
  source: { url: string; accessedAt: string; status: LearningStatus; applicability: string; limitation: string };
  improvement: string;
  independentEvaluation: string;
  outcome: "ACCEPTED" | "REJECTED";
  nextCycle: string;
}

export function canApplyLearningRecord(record: VerifiedLearningRecord): boolean {
  return record.outcome === "ACCEPTED"
    && record.source.status === "VERIFIED"
    && /^https:\/\//.test(record.source.url)
    && Boolean(record.baseline.trim())
    && Boolean(record.independentEvaluation.trim())
    && Boolean(record.nextCycle.trim());
}

/**
 * Scope is intentionally narrow: data quality provenance, not a claim about
 * platform ranking systems or a complete marketing strategy.
 */
export const divemProvenanceLearning: VerifiedLearningRecord = {
  id: "DIVEM-PROVENANCE-001",
  product: "DIVEM",
  problem: "A typed number was previously presented as verified evidence without an explicit source state.",
  baseline: "Before the change, any syntactically valid value from 0 to 1 entered the local score.",
  source: {
    url: "https://developers.google.com/analytics/devguides/reporting/data/v1/reporting-data-expectations",
    accessedAt: "2026-10-19",
    status: "VERIFIED",
    applicability: "Official guidance documents sampling, thresholding, aggregation and freshness limits; it supports showing data-quality boundaries before interpretation.",
    limitation: "It does not validate DiveM's score or infer any social-platform algorithm.",
  },
  improvement: "The local diagnostic excludes values marked as unconfirmed and shows why they were excluded.",
  independentEvaluation: "Presenter contracts cover confirmed, unconfirmed, malformed and insufficient inputs; Chromium mobile flow verifies the source-confirmation gate and the resulting 0.6 score.",
  outcome: "ACCEPTED",
  nextCycle: "Require an explicit source state before any future locally entered metric can affect a diagnostic.",
};
