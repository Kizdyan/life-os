export type AutonomyLevel = "auto" | "auto_report" | "approval";
export type VerificationState = "pending" | "verified" | "failed" | "uncertain";

export type ActionRisk =
  | "read_only"
  | "reversible"
  | "external"
  | "financial"
  | "destructive"
  | "security"
  | "production";

export interface ActionRequest<T = unknown> {
  id: string;
  actionGroupId: string;
  tool: string;
  input: T;
  risks: ActionRisk[];
  reversible: boolean;
  idempotencyKey: string;
}

export interface PolicyDecision {
  level: AutonomyLevel;
  reasons: string[];
}

export interface Observation {
  actionId: string;
  state: VerificationState;
  checkedAt: string;
  evidence?: Record<string, unknown>;
  message?: string;
}
