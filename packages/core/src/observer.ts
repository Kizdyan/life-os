import type { ActionRequest, Observation } from "./types";

export interface Verifier {
  verify(action: ActionRequest): Promise<Omit<Observation, "actionId" | "checkedAt">>;
}

export async function observe(action: ActionRequest, verifier: Verifier): Promise<Observation> {
  try {
    const result = await verifier.verify(action);
    return { ...result, actionId: action.id, checkedAt: new Date().toISOString() };
  } catch (error) {
    return {
      actionId: action.id,
      state: "uncertain",
      checkedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : "Observer failed",
    };
  }
}

export interface OutcomeVerification { ok: boolean; issues: string[]; }
export function verifyOutcome(x:{requested:string;status:string;successorExpected:boolean;successorId?:string|null}):OutcomeVerification { const issues:string[]=[]; if(x.requested==='complete'&&x.status!=='completed')issues.push('completion_not_persisted'); if(x.successorExpected&&!x.successorId)issues.push('successor_missing'); return {ok:issues.length===0,issues}; }
