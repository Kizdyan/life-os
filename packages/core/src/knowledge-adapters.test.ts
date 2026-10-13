import { describe, expect, it } from "vitest";
import { canonicalInputFromMemory, canonicalInputFromStyleObservation, type KnowledgeImportContext } from "./knowledge-adapters";

const context: KnowledgeImportContext = { importId: "migration-1", sourceSystem: "life-os-memory", sourceId: "memory-1", sourceAvailable: true };

describe("operational source to canonical authority boundaries", () => {
  it("maps legacy explicit preferences without turning the source into another authority", () => {
    const input = canonicalInputFromMemory({ id: "memory-1", kind: "preference", key: "tone", value: "calm", source: "user", confidence: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-02-01T00:00:00.000Z" }, context);
    expect(input).toMatchObject({ domain: "profile", key: "tone", kind: "preference", epistemic: "user-stated", value: "calm", recordedAt: "2026-02-01T00:00:00.000Z" });
    expect(input.sources[0]).toMatchObject({ sourceSystem: "life-os-memory", sourceId: "memory-1", available: true });
  });

  it("maps style memory as an observation with retained source lineage", () => {
    const input = canonicalInputFromStyleObservation({ assetId: "asset-1", dimension: "pacing", value: "measured", signal: "specific_feedback", weight: 0.82, createdAt: "2026-03-01T00:00:00.000Z" }, { ...context, importId: "style-import", sourceSystem: "persona-style", sourceId: "style-1" });
    expect(input).toMatchObject({ domain: "persona_style", key: "pacing", kind: "observation", epistemic: "observed", value: { value: "measured", signal: "specific_feedback", weight: 0.82, assetId: "asset-1" } });
  });
});
