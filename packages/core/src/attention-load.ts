import type { LifeItem } from "./life-item";

export type AttentionReason =
  | "due_soon"
  | "overdue"
  | "missed_time"
  | "not_completed"
  | "moved";

export interface AttentionEntry {
  itemId: string;
  title: string;
  kind: LifeItem["kind"];
  reason: AttentionReason;
  plannedStart: string | null;
  priority: number;
}

export interface AttentionLoadPolicy {
  mediumAt: number;
  highAt: number;
  dueSoonHours: number;
}

export interface AttentionDigest {
  visible: AttentionEntry[];
  hiddenCount: number;
  load: "low" | "medium" | "high";
  needsConsolidation: boolean;
  isClinicalAssessment: false;
}

export const DEFAULT_ATTENTION_LOAD_POLICY: AttentionLoadPolicy = {
  mediumAt: 3,
  highAt: 6,
  dueSoonHours: 24,
};

export function buildAttentionDigest(input: {
  items: LifeItem[];
  now: string;
  maxVisible?: number;
  policy?: AttentionLoadPolicy;
}): AttentionDigest {
  const policy = input.policy ?? DEFAULT_ATTENTION_LOAD_POLICY;
  validatePolicy(policy);

  const nowMs = Date.parse(input.now);
  if (!Number.isFinite(nowMs)) throw new Error("Invalid current time");

  const entries = input.items
    .map((item) => toAttentionEntry(item, nowMs, policy))
    .filter((entry): entry is AttentionEntry => entry !== null)
    .sort(compareAttentionEntries);

  const maxVisible = Math.max(0, Math.floor(input.maxVisible ?? 5));
  const visible = entries.slice(0, maxVisible);
  const hiddenCount = Math.max(0, entries.length - visible.length);

  return {
    visible,
    hiddenCount,
    load:
      entries.length >= policy.highAt
        ? "high"
        : entries.length >= policy.mediumAt
          ? "medium"
          : "low",
    needsConsolidation: hiddenCount > 0,
    isClinicalAssessment: false,
  };
}

function toAttentionEntry(
  item: LifeItem,
  nowMs: number,
  policy: AttentionLoadPolicy,
): AttentionEntry | null {
  if (item.status === "completed" || item.status === "partial") return null;

  if (item.status === "missed_time") {
    return makeEntry(item, "missed_time", 70);
  }
  if (item.status === "not_completed") {
    return makeEntry(item, "not_completed", 65);
  }
  if (item.status === "moved") {
    return makeEntry(item, "moved", 60);
  }

  if (item.status !== "planned" || !item.plannedStart) return null;

  const startMs = Date.parse(item.plannedStart);
  if (!Number.isFinite(startMs)) return null;

  if (startMs < nowMs) {
    return makeEntry(item, "overdue", isFixed(item) ? 110 : 90);
  }

  const dueSoonMs = policy.dueSoonHours * 60 * 60 * 1000;
  if (startMs - nowMs <= dueSoonMs) {
    return makeEntry(item, "due_soon", isFixed(item) ? 120 : 80);
  }

  return null;
}

function makeEntry(
  item: LifeItem,
  reason: AttentionReason,
  priority: number,
): AttentionEntry {
  return {
    itemId: item.id,
    title: item.title,
    kind: item.kind,
    reason,
    plannedStart: item.plannedStart,
    priority,
  };
}

function isFixed(item: LifeItem): boolean {
  return item.kind === "event" || item.kind === "travel";
}

function compareAttentionEntries(a: AttentionEntry, b: AttentionEntry): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  if (a.plannedStart === b.plannedStart) return a.itemId.localeCompare(b.itemId);
  if (a.plannedStart === null) return 1;
  if (b.plannedStart === null) return -1;
  return a.plannedStart.localeCompare(b.plannedStart);
}

function validatePolicy(policy: AttentionLoadPolicy): void {
  if (
    !Number.isFinite(policy.mediumAt) ||
    !Number.isFinite(policy.highAt) ||
    !Number.isFinite(policy.dueSoonHours) ||
    policy.mediumAt < 1 ||
    policy.highAt < policy.mediumAt ||
    policy.dueSoonHours < 0
  ) {
    throw new Error("Invalid attention load policy");
  }
}
