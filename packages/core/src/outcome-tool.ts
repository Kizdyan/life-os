import type { TypedTool, ToolResult } from './actions';
import type { ActionRequest } from './types';
import { applyOutcome } from './outcomes';
import type { LifeItemRepository, OutcomeToolInput } from './outcome-store';

export class LifeSetOutcomeTool implements TypedTool<OutcomeToolInput> {
  readonly name = 'life.set_outcome';

  constructor(private readonly repo: LifeItemRepository, private readonly now = () => new Date().toISOString()) {}

  async execute(action: ActionRequest<OutcomeToolInput>): Promise<ToolResult> {
    const item = await this.repo.get(action.input.itemId);
    const now = this.now();
    const successorId = action.input.carryForward && action.input.nextDate
      ? `${item.id}:${action.input.nextDate}`
      : undefined;

    const result = applyOutcome({
      item,
      command: action.input.command,
      plannedDate: action.input.plannedDate,
      source: action.input.source,
      now,
      carryForward: action.input.carryForward,
      nextDate: action.input.nextDate,
      successorId,
    });

    await this.repo.commit(result);
    return { evidence: { itemId: item.id, status: result.current.status, successorItemId: result.successor?.id ?? null } };
  }
}
