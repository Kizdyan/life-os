import { describe, expect, it } from "vitest";
import { diagnoseVerifiedMeasurements, DiveMStrategyClient } from "./divem-strategy-client";

describe("DiveM strategy client adapter", () => {
  it("maps Life OS media request to the DiveM personal contract", async () => {
    let received: Record<string, unknown> | null = null;
    const client = new DiveMStrategyClient({
      assessContent: async (payload) => {
        received = payload;
        return {
          fit: "mixed",
          notes: ["hook needs work"],
          weak_transition: "interest",
          revision_suggestions: ["clarify first two seconds"],
          confidence: 0.8,
          evidence_state: "partial",
        };
      },
    });

    const result = await client.assessContent({
      profileId: "personal",
      projectId: "project-1",
      assetIds: ["asset-1"],
      channel: "instagram",
      goal: "profile visits",
      currentFocus: ["acting"],
      proposedHook: "backstage",
      proposedStructure: ["1:hook", "2:payoff"],
      evidence: { hook_clarity: 0.4 },
    });

    expect(received).toMatchObject({
      profile_id: "personal",
      project_id: "project-1",
      asset_ids: ["asset-1"],
      proposed_hook: "backstage",
      proposed_structure: ["1:hook", "2:payoff"],
      evidence: { hook_clarity: 0.4 },
    });
    expect(result).toEqual({
      fit: "mixed",
      notes: ["hook needs work"],
      weakTransition: "interest",
      revisionSuggestions: ["clarify first two seconds"],
      confidence: 0.8,
      evidenceState: "partial",
    });
  });

  it("fails closed on impossible confidence values", async () => {
    const client = new DiveMStrategyClient({
      assessContent: async () => ({
        fit: "strong",
        notes: [],
        weak_transition: null,
        revision_suggestions: [],
        confidence: 1.5,
        evidence_state: "sufficient",
      }),
    });

    await expect(
      client.assessContent({
        profileId: "personal",
        projectId: "project-1",
        assetIds: [],
        channel: "instagram",
        goal: "test",
        currentFocus: [],
      }),
    ).rejects.toThrow("confidence");
  });

  it.each([
    ["notes", { notes: null }],
    ["revision_suggestions", { revision_suggestions: { text: "unsafe" } }],
  ])("fails closed when provider %s is not an array", async (field, malformed) => {
    const client = new DiveMStrategyClient({
      assessContent: async () => ({
        fit: "mixed",
        notes: [],
        weak_transition: null,
        revision_suggestions: [],
        confidence: 0,
        evidence_state: "insufficient",
        ...malformed,
      }) as any,
    });

    await expect(client.assessContent({
      profileId: "personal",
      projectId: "project-1",
      assetIds: [],
      channel: "instagram",
      goal: "test",
      currentFocus: [],
    })).rejects.toThrow(`${field} must be an array`);
  });

  it.each([
    ["notes", { notes: ["valid", 7] }],
    ["revision_suggestions", { revision_suggestions: ["valid", { text: "unsafe" }] }],
  ])("fails closed when provider %s contains non-string entries", async (field, malformed) => {
    const client = new DiveMStrategyClient({
      assessContent: async () => ({
        fit: "mixed",
        notes: [],
        weak_transition: null,
        revision_suggestions: [],
        confidence: 0.5,
        evidence_state: "partial",
        ...malformed,
      }) as any,
    });

    await expect(client.assessContent({
      profileId: "personal",
      projectId: "project-1",
      assetIds: [],
      channel: "instagram",
      goal: "test",
      currentFocus: [],
    })).rejects.toThrow(field+" entries must be strings");
  });

  it.each([
    ["fit", { fit: "excellent" }],
    ["weak_transition", { weak_transition: "awareness" }],
    ["evidence_state", { evidence_state: "verified" }],
  ])("fails closed when provider %s is outside its canonical enum", async (field, malformed) => {
    const client = new DiveMStrategyClient({
      assessContent: async () => ({
        fit: "mixed",
        notes: [],
        weak_transition: null,
        revision_suggestions: [],
        confidence: 0.5,
        evidence_state: "partial",
        ...malformed,
      }) as any,
    });

    await expect(client.assessContent({
      profileId: "personal",
      projectId: "project-1",
      assetIds: [],
      channel: "instagram",
      goal: "test",
      currentFocus: [],
    })).rejects.toThrow(field+" must be one of");
  });
});

describe("evidence-bound DiveM diagnostic", () => {
  it("derives an explainable score and one recommendation from verified measurements", () => {
    expect(diagnoseVerifiedMeasurements({
      tenantId: "tenant-1",
      authorizedTenantId: "tenant-1",
      measurements: { profile_clarity: 0.8, content_consistency: 0.4 },
    })).toEqual({
      state: "ACTIONABLE",
      score: 0.6,
      components: [
        { name: "profile_clarity", value: 0.8, evidenceState: "VERIFIED" },
        { name: "content_consistency", value: 0.4, evidenceState: "VERIFIED" },
      ],
      weakestComponent: "content_consistency",
      recommendation: "Improve content_consistency before changing other tactics.",
    });
  });

  it("fails closed on a tenant mismatch or non-finite/out-of-range measurements", () => {
    expect(() => diagnoseVerifiedMeasurements({
      tenantId: "tenant-1",
      authorizedTenantId: "tenant-2",
      measurements: { profile_clarity: 0.8 },
    })).toThrow("tenant");

    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -0.1, 1.1]) {
      expect(() => diagnoseVerifiedMeasurements({
        tenantId: "tenant-1",
        authorizedTenantId: "tenant-1",
        measurements: { profile_clarity: value },
      })).toThrow("measurement");
    }
  });

  it("reports UNKNOWN rather than inventing a diagnosis from insufficient evidence", () => {
    expect(diagnoseVerifiedMeasurements({
      tenantId: "tenant-1",
      authorizedTenantId: "tenant-1",
      measurements: { profile_clarity: 0.8 },
    })).toEqual({
      state: "UNKNOWN",
      score: null,
      components: [{ name: "profile_clarity", value: 0.8, evidenceState: "VERIFIED" }],
      weakestComponent: null,
      recommendation: null,
    });
  });
});
