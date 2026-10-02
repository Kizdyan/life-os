import type { LifeItem } from "./life-item";
import type { MediaCapabilities } from "./media-brain";

export type MediaOpportunityKind =
  | "capture_backstage"
  | "capture_performance"
  | "capture_music"
  | "capture_process"
  | "reuse_existing";

export interface MediaLifeAnnotation {
  lifeItemId: string;
  eligible: boolean;
  kind: MediaOpportunityKind;
  priority: "low" | "normal" | "high";
  reason: string;
  requiresExtraEffort: boolean;
}

export interface LifeOsMediaSnapshot {
  date: string;
  items: LifeItem[];
  annotations: MediaLifeAnnotation[];
  currentFocus: string[];
  existingCaptureCount: number;
}

export interface MediaCapturePolicy {
  maxNewCapturePromptsPerDay: number;
  allowExtraEffortPrompts: boolean;
}

export const PERSONAL_CAPTURE_POLICY: MediaCapturePolicy = {
  maxNewCapturePromptsPerDay: 2,
  allowExtraEffortPrompts: false,
};

export interface MediaOpportunity {
  lifeItemId: string;
  title: string;
  kind: MediaOpportunityKind;
  priority: "low" | "normal" | "high";
  reason: string;
  plannedStart: string | null;
}

export function deriveMediaOpportunities(input: {
  snapshot: LifeOsMediaSnapshot;
  capabilities: MediaCapabilities;
  policy?: MediaCapturePolicy;
}): MediaOpportunity[] {
  if (!input.capabilities.lifeOsContextEnabled) return [];

  const policy = input.policy ?? PERSONAL_CAPTURE_POLICY;
  const remaining = Math.max(
    0,
    policy.maxNewCapturePromptsPerDay - input.snapshot.existingCaptureCount,
  );
  if (remaining === 0) return [];

  const byId = new Map(input.snapshot.items.map((item) => [item.id, item]));
  const priorityScore = { high: 3, normal: 2, low: 1 };

  return input.snapshot.annotations
    .filter((annotation) => annotation.eligible)
    .filter(
      (annotation) =>
        policy.allowExtraEffortPrompts || !annotation.requiresExtraEffort,
    )
    .map((annotation): MediaOpportunity | null => {
      const item = byId.get(annotation.lifeItemId);
      if (!item) return null;
      if (["completed", "not_completed", "missed_time"].includes(item.status)) {
        return null;
      }
      return {
        lifeItemId: item.id,
        title: item.title,
        kind: annotation.kind,
        priority: annotation.priority,
        reason: annotation.reason,
        plannedStart: item.plannedStart,
      };
    })
    .filter((item): item is MediaOpportunity => item !== null)
    .sort(
      (a, b) =>
        priorityScore[b.priority] - priorityScore[a.priority] ||
        compareNullableIso(a.plannedStart, b.plannedStart),
    )
    .slice(0, remaining);
}

function compareNullableIso(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b);
}
