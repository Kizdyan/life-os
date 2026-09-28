import type { ActionRequest, Observation, PolicyDecision } from "./types";

export type ActionState =
  | "proposed"
  | "awaiting_approval"
  | "executing"
  | "executed"
  | "verified"
  | "failed"
  | "undone";

export interface AuditEntry {
  id: string;
  action: ActionRequest;
  policy: PolicyDecision;
  state: ActionState;
  observation?: Observation;
  createdAt: string;
  updatedAt: string;
}

export interface ToolResult {
  evidence?: Record<string, unknown>;
  undoToken?: string;
}

export interface TypedTool<T = unknown> {
  name: string;
  execute(action: ActionRequest<T>): Promise<ToolResult>;
  undo?(undoToken: string): Promise<void>;
}

export class ToolRegistry {
  private readonly tools = new Map<string, TypedTool>();

  register(tool: TypedTool): void {
    if (this.tools.has(tool.name)) throw new Error(`Tool already registered: ${tool.name}`);
    this.tools.set(tool.name, tool);
  }

  get(name: string): TypedTool {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    return tool;
  }
}
