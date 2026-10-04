import { describe, expect, it } from "vitest";
import { MediaStateStore, type KeyValueStore } from "./media-state-store";
import type { PersonaApprovalRecord, PersonaPublicationJob } from "./persona-state";

class MemoryKv implements KeyValueStore {
  values = new Map<string, string>();
  async get(key: string): Promise<string | null> { return this.values.get(key) ?? null; }
  async set(key: string, value: string): Promise<void> { this.values.set(key, value); }
}

describe("Persona durable state", () => {
  it("reads a legacy Media Brain snapshot with empty Persona collections", async () => {
    const kv = new MemoryKv();
    kv.values.set("lifeos:media-brain:v1", JSON.stringify({
      schemaVersion: 1,
      revision: 7,
      assetsByIngestKey: {}, jobsById: {}, projectsByKey: {}, candidatesById: {},
      latestCandidateIdByProject: {}, styleObservations: [], audienceSignals: [],
      updatedAt: "2026-10-04T10:00:00.000Z",
    }));
    const store = new MediaStateStore({ kv, now: () => "2026-10-04T12:00:00.000Z" });
    const snapshot = await store.snapshot();
    expect(snapshot.personaApprovalsByCandidate).toEqual({});
    expect(snapshot.personaPublicationJobsById).toEqual({});
    expect(snapshot.personaMetricSnapshots).toEqual([]);
    expect(snapshot.personaLearningSignals).toEqual([]);
  });

  it("round-trips approvals and publication jobs in the same durable snapshot", async () => {
    const store = new MediaStateStore({ kv: new MemoryKv(), now: () => "2026-10-04T12:00:00.000Z" });
    const approval: PersonaApprovalRecord = {
      candidateId: "candidate-1", revision: 1, decision: "approved",
      reason: null, decidedAt: "2026-10-04T11:00:00.000Z",
    };
    const job: PersonaPublicationJob = {
      id: "pub-1", candidateId: "candidate-1", platform: "instagram",
      state: "approved", idempotencyKey: "candidate-1:instagram:1",
      scheduledAt: null, externalId: null, externalUrl: null, attempts: 0,
      lastError: null, createdAt: "2026-10-04T11:01:00.000Z", updatedAt: "2026-10-04T11:01:00.000Z",
    };
    await store.savePersonaApproval(approval);
    await store.savePersonaPublicationJob(job);
    const snapshot = await store.snapshot();
    expect(snapshot.personaApprovalsByCandidate["candidate-1"]).toEqual(approval);
    expect(snapshot.personaPublicationJobsById["pub-1"]).toEqual(job);
  });
});
