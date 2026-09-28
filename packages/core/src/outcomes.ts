import type { LifeItem, LifeItemStatus } from './life-item';

export type OutcomeCommand = 'complete' | 'not_complete' | 'partial' | 'move';

export interface OutcomeRecord {
  id: string;
  itemId: string;
  plannedDate: string;
  result: 'completed' | 'partial' | 'missed_time' | 'not_completed' | 'moved';
  recordedAt: string;
  source: 'ui' | 'erika' | 'system';
  successorItemId: string | null;
}

export interface ApplyOutcomeInput {
  item: LifeItem;
  command: OutcomeCommand;
  plannedDate: string;
  source: OutcomeRecord['source'];
  now: string;
  carryForward: boolean;
  nextDate?: string;
  successorId?: string;
}

export interface ApplyOutcomeResult {
  current: LifeItem;
  outcome: OutcomeRecord;
  successor: LifeItem | null;
}

type FinalOutcomeStatus = Exclude<LifeItemStatus, 'planned'>;

function statusFor(command: OutcomeCommand): FinalOutcomeStatus {
  if (command === 'complete') return 'completed';
  if (command === 'partial') return 'partial';
  if (command === 'move') return 'moved';
  return 'not_completed';
}

export function applyOutcome(input: ApplyOutcomeInput): ApplyOutcomeResult {
  const status = statusFor(input.command);
  const shouldCarry = input.command === 'not_complete' && input.carryForward;
  if (shouldCarry && (!input.nextDate || !input.successorId)) {
    throw new Error('carryForward requires nextDate and successorId');
  }

  const current: LifeItem = {
    ...input.item,
    status: shouldCarry ? 'missed_time' : status,
    actualEnd: input.command === 'complete' ? input.now : input.item.actualEnd,
    version: input.item.version + 1,
    updatedAt: input.now,
  };

  const successor = shouldCarry ? {
    ...input.item,
    id: input.successorId!,
    status: 'planned' as const,
    plannedStart: shiftDate(input.item.plannedStart, input.nextDate!),
    plannedEnd: shiftDate(input.item.plannedEnd, input.nextDate!),
    actualStart: null,
    actualEnd: null,
    version: 1,
    createdAt: input.now,
    updatedAt: input.now,
  } : null;

  return {
    current,
    successor,
    outcome: {
      id: `outcome:${input.item.id}:${input.plannedDate}`,
      itemId: input.item.id,
      plannedDate: input.plannedDate,
      result: shouldCarry ? 'missed_time' : status === 'completed' ? 'completed' : status === 'not_completed' ? 'not_completed' : status,
      recordedAt: input.now,
      source: input.source,
      successorItemId: successor?.id ?? null,
    },
  };
}

function shiftDate(value: string | null, nextDate: string): string | null {
  if (!value) return null;
  const time = value.includes('T') ? value.slice(value.indexOf('T')) : '';
  return `${nextDate}${time}`;
}
