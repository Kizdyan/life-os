import type { PersonaApprovalDecision, PersonaApprovalRecord } from "./persona-state";

export interface PersonaDecisionInput {
  candidateId: string;
  previous?: PersonaApprovalRecord;
  decision: PersonaApprovalDecision;
  reason: string | null;
  now: string;
}

export function decidePersonaCandidate(input: PersonaDecisionInput): PersonaApprovalRecord {
  const candidateId = input.candidateId.trim();
  if (!candidateId) throw new Error("Persona candidate id is required");
  if (input.previous && input.previous.candidateId !== candidateId) {
    throw new Error("Previous approval belongs to another candidate");
  }
  return {
    candidateId,
    revision: (input.previous?.revision ?? 0) + 1,
    decision: input.decision,
    reason: normalizeReason(input.reason),
    decidedAt: input.now,
  };
}

export function canPublishPersonaCandidate(approval?: PersonaApprovalRecord | null): boolean {
  return approval?.decision === "approved";
}

function normalizeReason(reason: string | null): string | null {
  const value = reason?.trim();
  return value ? value : null;
}
