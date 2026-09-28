import type { OutcomeCommand } from './outcomes';
import type { SetOutcomeActionInput } from './commands';

const DONE = /\b(сделал|сделала|выполнил|выполнила|готово|выполнено)\b/i;
const NOT_DONE = /\b(не сделал|не сделала|не выполнил|не выполнила|не выполнено)\b/i;
const MOVE = /\b(перенеси|перенести|перенос)\b/i;
const TOMORROW = /\b(на завтра|завтра)\b/i;

export function parseErikaOutcome(text: string, itemId: string, plannedDate: string, nextDate: string): SetOutcomeActionInput | null {
  let command: OutcomeCommand | null = null;
  if (NOT_DONE.test(text)) command = 'not_complete';
  else if (MOVE.test(text)) command = 'move';
  else if (DONE.test(text)) command = 'complete';
  if (!command) return null;

  const carryForward = command === 'not_complete' && TOMORROW.test(text);
  return {
    itemId,
    command,
    plannedDate,
    carryForward,
    nextDate: carryForward || command === 'move' ? nextDate : undefined,
    source: 'erika',
  };
}
