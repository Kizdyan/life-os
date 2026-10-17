import { describe, expect, it } from "vitest";
import { DiveMStrategyClient } from "./divem-strategy-client";

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
});
