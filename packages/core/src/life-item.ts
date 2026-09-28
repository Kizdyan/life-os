export type LifeItemStatus =
  | "planned"
  | "completed"
  | "partial"
  | "moved"
  | "missed_time"
  | "not_completed";

export type LifeItemKind =
  | "task"
  | "event"
  | "routine"
  | "habit"
  | "travel"
  | "meal"
  | "recovery";

export interface LifeItem {
  id: string;
  kind: LifeItemKind;
  title: string;
  status: LifeItemStatus;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  projectId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}
