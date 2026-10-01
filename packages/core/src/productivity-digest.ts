import type { LifeItem } from "./life-item";
import {
  buildAttentionDigest,
  type AttentionDigest,
  type AttentionLoadPolicy,
} from "./attention-load";
import {
  deriveRecoveryAction,
  type RecoveryActionKind,
} from "./recovery-protocol";

export interface ProductivityRecoveryEntry {
  itemId: string;
  title: string;
  action: RecoveryActionKind;
  priorityBoost: 0 | 1 | 2;
  shouldAutoSchedule: boolean;
  preserveOriginalOutcome: true;
  reason: string;
}

export interface ProductivityDigest {
  attention: AttentionDigest;
  recovery: ProductivityRecoveryEntry[];
}

export function buildProductivityDigest(input: {
  items: LifeItem[];
  now: string;
  consecutiveMissesByItem: Record<string, number>;
  maxVisible?: number;
  attentionPolicy?: AttentionLoadPolicy;
}): ProductivityDigest {
  const attention = buildAttentionDigest({
    items: input.items,
    now: input.now,
    maxVisible: input.maxVisible,
    policy: input.attentionPolicy,
  });

  const recovery = input.items
    .filter(
      (item) =>
        item.status === "missed_time" || item.status === "not_completed",
    )
    .map((item) => {
      const action = deriveRecoveryAction({
        item,
        consecutiveMisses: input.consecutiveMissesByItem[item.id] ?? 1,
      });
      return {
        itemId: item.id,
        title: item.title,
        action: action.action,
        priorityBoost: action.priorityBoost,
        shouldAutoSchedule: action.shouldAutoSchedule,
        preserveOriginalOutcome: action.preserveOriginalOutcome,
        reason: action.reason,
      } satisfies ProductivityRecoveryEntry;
    })
    .filter((entry) => entry.action !== "none");

  return { attention, recovery };
}
