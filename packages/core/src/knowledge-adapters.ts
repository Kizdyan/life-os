import type { MemoryRecord } from "./memory";
import type { StyleMemoryObservation } from "./media-brain";
import type { KnowledgeEpistemic, KnowledgeInput, KnowledgeKind } from "./knowledge-authority";

export interface KnowledgeImportContext {
  importId: string;
  sourceSystem: string;
  sourceId: string;
  sourceAvailable: boolean;
}

const memoryKind: Record<MemoryRecord["kind"], KnowledgeKind> = {
  preference: "preference",
  rule: "constraint",
  person: "fact",
  project: "fact",
  observation: "observation",
};

const memoryEpistemic: Record<MemoryRecord["source"], KnowledgeEpistemic> = {
  user: "user-stated",
  system: "inferred",
  observed: "observed",
};

export function canonicalInputFromMemory(record: MemoryRecord, context: KnowledgeImportContext): KnowledgeInput {
  return {
    importId: context.importId,
    domain: "profile",
    key: record.key,
    kind: memoryKind[record.kind],
    epistemic: memoryEpistemic[record.source],
    value: structuredClone(record.value),
    recordedAt: record.updatedAt,
    validFrom: record.createdAt,
    sensitivity: "private",
    personaExposure: "explicit-only",
    sources: [{ sourceId: context.sourceId, sourceSystem: context.sourceSystem, available: context.sourceAvailable, capturedAt: record.updatedAt }],
  };
}

export function canonicalInputFromStyleObservation(observation: StyleMemoryObservation, context: KnowledgeImportContext): KnowledgeInput {
  return {
    importId: context.importId,
    domain: "persona_style",
    key: observation.dimension,
    kind: "observation",
    epistemic: observation.signal === "inferred" ? "inferred" : "observed",
    value: { value: observation.value, signal: observation.signal, weight: observation.weight, assetId: observation.assetId },
    recordedAt: observation.createdAt,
    validFrom: observation.createdAt,
    sensitivity: "private",
    personaExposure: "explicit-only",
    sources: [{ sourceId: context.sourceId, sourceSystem: context.sourceSystem, available: context.sourceAvailable, capturedAt: observation.createdAt }],
  };
}
