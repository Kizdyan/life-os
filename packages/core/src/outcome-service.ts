import { AutonomyEngine } from './engine';
import { LifeSetOutcomeTool } from './outcome-tool';
import { ToolRegistry, type AuditEntry } from './actions';
import { setOutcomeAction, type SetOutcomeActionInput } from './commands';
import type { AuditStore } from './engine';
import type { Verifier } from './observer';
import type { LifeItemRepository } from './outcome-store';

export function createOutcomeEngine(repo: LifeItemRepository, audit: AuditStore, verifier: Verifier) {
  const tools = new ToolRegistry();
  tools.register(new LifeSetOutcomeTool(repo));
  return new AutonomyEngine(tools, verifier, audit);
}

export async function setOutcome(engine: AutonomyEngine, input: SetOutcomeActionInput): Promise<AuditEntry> {
  const actionId = crypto.randomUUID();
  return engine.run(setOutcomeAction(input, actionId));
}

export function uiOutcome(itemId: string, command: SetOutcomeActionInput['command'], plannedDate: string, carryForward=false, nextDate?: string): SetOutcomeActionInput {
  return { itemId, command, plannedDate, carryForward, nextDate, source:'ui' };
}
