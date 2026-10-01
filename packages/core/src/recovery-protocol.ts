import type { LifeItem } from "./life-item";

export type RecoveryActionKind = "none" | "retry_soon" | "minimum_version" | "review_fixed";

export interface RecoveryAction {
  action: RecoveryActionKind;
  priorityBoost: 0 | 1 | 2;
  shouldAutoSchedule: boolean;
  preserveOriginalOutcome: true;
  reason: string;
}

export function deriveRecoveryAction(input: { item: LifeItem; consecutiveMisses: number }): RecoveryAction {
  const failed = input.item.status === "missed_time" || input.item.status === "not_completed";
  if (!failed) return { action: "none", priorityBoost: 0, shouldAutoSchedule: false, preserveOriginalOutcome: true, reason: "No recovery action is needed for this outcome." };

  if (input.item.kind === "event" || input.item.kind === "travel") {
    return { action: "review_fixed", priorityBoost: 0, shouldAutoSchedule: false, preserveOriginalOutcome: true, reason: "Fixed commitments are reviewed instead of silently rescheduled." };
  }

  if (Math.max(0, input.consecutiveMisses) >= 2) {
    return { action: "minimum_version", priorityBoost: 2, shouldAutoSchedule: true, preserveOriginalOutcome: true, reason: "Two consecutive misses trigger a smaller recovery version instead of another full-size retry." };
  }

  return { action: "retry_soon", priorityBoost: 1, shouldAutoSchedule: true, preserveOriginalOutcome: true, reason: "A single miss should be followed by a near-term recovery opportunity without erasing the original outcome." };
}
