import type { AuditEntry } from "./actions";
import type { ActionRequest } from "./types";
import type { AutonomyEngine } from "./engine";

export type AutomationJobStatus = "queued" | "running" | "verified" | "failed" | "awaiting_approval" | "blocked";
export interface AutomationJob {
  id: string;
  action: ActionRequest;
  dependsOn?: string[];
  maxAttempts?: number;
}
export interface AutomationJobResult {
  id: string;
  status: AutomationJobStatus;
  attempts: number;
  audit?: AuditEntry;
  reason?: string;
}
export interface AutomationRunResult {
  results: AutomationJobResult[];
  verified: number;
  failed: number;
  blocked: number;
  awaitingApproval: number;
}
export interface AutomationRunnerOptions {
  /** Retry only tools explicitly declared safe for repeated execution. */
  retryableTools?: readonly string[];
  /** Total attempts per job, including the first. */
  maxAttempts?: number;
}

/**
 * Executes a bounded DAG of typed actions, with independent Observer verification
 * delegated to AutonomyEngine. Never marks execution itself as success.
 *
 * Intentionally does not schedule itself, store secrets or run paid providers.
 * Callers must persist run results and enforce a single active worker per queue.
 */
export class ErikaAutomationRunner {
  constructor(private readonly engine: Pick<AutonomyEngine, "run">, private readonly options: AutomationRunnerOptions = {}) {}

  async run(jobs: readonly AutomationJob[]): Promise<AutomationRunResult> {
    const ids = new Set<string>();
    const actionIds = new Set<string>();
    for (const job of jobs) {
      if (!job.id.trim() || ids.has(job.id)) throw new Error("Duplicate or empty automation job id");
      if (!job.action.id.trim() || actionIds.has(job.action.id)) throw new Error("Duplicate or empty action id");
      ids.add(job.id);
      actionIds.add(job.action.id);
    }
    for (const job of jobs) {
      if (job.dependsOn?.some(id => !ids.has(id) || id === job.id)) throw new Error("Unknown or self dependency");
    }
    const byId = new Map<string, AutomationJobResult>();
    const pending = new Map(jobs.map(job => [job.id, job]));
    while (pending.size) {
      let progressed = false;
      for (const [id, job] of pending) {
        const dependencies = job.dependsOn ?? [];
        if (dependencies.some(dep => !byId.has(dep))) continue;
        progressed = true;
        pending.delete(id);
        if (dependencies.some(dep => byId.get(dep)?.status !== "verified")) {
          byId.set(id, { id, status: "blocked", attempts: 0, reason: "Dependency was not verified" });
          continue;
        }
        const cap = Math.min(3, Math.max(1, Math.floor(job.maxAttempts ?? this.options.maxAttempts ?? 1)));
        const canRetry = this.options.retryableTools?.includes(job.action.tool) === true &&
          !!job.action.idempotencyKey &&
          job.action.risks.every(risk => risk === "read_only" || risk === "reversible");
        const attemptsAllowed = canRetry ? cap : 1;
        let result: AutomationJobResult = { id, status: "failed", attempts: 0 };
        for (let attempt = 1; attempt <= attemptsAllowed; attempt++) {
          try {
            const audit = await this.engine.run(job.action);
            const status: AutomationJobStatus = audit.state === "verified" ? "verified" :
              audit.state === "awaiting_approval" ? "awaiting_approval" : "failed";
            result = { id, status, attempts: attempt, audit, reason: audit.observation?.message };
            if (status !== "failed") break;
          } catch (error) {
            result = { id, status: "failed", attempts: attempt, reason: error instanceof Error ? error.message : "Unknown failure" };
          }
        }
        byId.set(id, result);
      }
      if (!progressed) {
        for (const id of pending.keys()) byId.set(id, { id, status: "blocked", attempts: 0, reason: "Dependency cycle" });
        break;
      }
    }
    const results = jobs.map(job => byId.get(job.id)!);
    return {
      results,
      verified: results.filter(result => result.status === "verified").length,
      failed: results.filter(result => result.status === "failed").length,
      blocked: results.filter(result => result.status === "blocked").length,
      awaitingApproval: results.filter(result => result.status === "awaiting_approval").length,
    };
  }
}
