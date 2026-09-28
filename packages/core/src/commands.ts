import type { ActionRequest } from './types';
import type { OutcomeCommand } from './outcomes';

export interface SetOutcomeActionInput {
  itemId: string;
  command: OutcomeCommand;
  plannedDate: string;
  carryForward: boolean;
  nextDate?: string;
  source: 'ui' | 'erika';
}

export function setOutcomeAction(input: SetOutcomeActionInput, actionId: string): ActionRequest<SetOutcomeActionInput> {
  return {
    id: actionId,
    actionGroupId: actionId,
    tool: 'life.set_outcome',
    input,
    risks: ['reversible'],
    reversible: true,
    idempotencyKey: `set-outcome:${input.itemId}:${input.plannedDate}:${input.command}`,
  };
}
