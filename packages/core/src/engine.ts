import { decideAutonomy } from "./policy";
import { observe, type Verifier } from "./observer";
import { ToolRegistry, type AuditEntry } from "./actions";
import type { ActionRequest } from "./types";

export interface AuditStore {
  save(entry: AuditEntry): Promise<void>;
}

export class AutonomyEngine {
  constructor(
    private readonly tools: ToolRegistry,
    private readonly observer: Verifier,
    private readonly audit: AuditStore,
  ) {}

  async run(action: ActionRequest): Promise<AuditEntry> {
    const policy = decideAutonomy(action);
    const now = new Date().toISOString();
    const entry: AuditEntry = {
      id: action.id,
      action,
      policy,
      state: policy.level === "approval" ? "awaiting_approval" : "proposed",
      createdAt: now,
      updatedAt: now,
    };

    await this.audit.save(entry);
    if (policy.level === "approval") return entry;

    entry.state = "executing";
    entry.updatedAt = new Date().toISOString();
    await this.audit.save(entry);

    try {
      await this.tools.get(action.tool).execute(action);
      entry.state = "executed";
      entry.updatedAt = new Date().toISOString();
      await this.audit.save(entry);

      entry.observation = await observe(action, this.observer);
      entry.state = entry.observation.state === "verified" ? "verified" : "failed";
    } catch (error) {
      entry.state = "failed";
      entry.observation = {
        actionId: action.id,
        state: "failed",
        checkedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : "Execution failed",
      };
    }

    entry.updatedAt = new Date().toISOString();
    await this.audit.save(entry);
    return entry;
  }
}
