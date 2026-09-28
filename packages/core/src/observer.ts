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
