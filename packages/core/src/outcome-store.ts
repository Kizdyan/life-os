import type { ApplyOutcomeInput, ApplyOutcomeResult } from './outcomes';

export interface OutcomeStore {
  apply(input: ApplyOutcomeInput): Promise<ApplyOutcomeResult>;
  get(itemId: string): Promise<ApplyOutcomeResult | null>;
}

export interface OutcomeToolInput {
  itemId: string;
  command: ApplyOutcomeInput['command'];
  plannedDate: string;
  carryForward: boolean;
  nextDate?: string;
  source: 'ui' | 'erika';
}

export interface LifeItemRepository {
  get(itemId: string): Promise<ApplyOutcomeInput['item']>;
  commit(result: ApplyOutcomeResult): Promise<void>;
}
