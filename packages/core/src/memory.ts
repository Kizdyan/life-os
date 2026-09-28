export type MemoryKind = "preference" | "rule" | "person" | "project" | "observation";

export interface MemoryRecord {
  id: string;
  kind: MemoryKind;
  key: string;
  value: unknown;
  source: "user" | "system" | "observed";
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryStore {
  upsert(record: MemoryRecord): Promise<void>;
  find(kind: MemoryKind, key: string): Promise<MemoryRecord | null>;
}
