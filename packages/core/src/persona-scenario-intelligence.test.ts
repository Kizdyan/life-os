import { describe, expect, it } from "vitest";
import {
  analyseScenarioReference,
  suggestScenarioIdeas,
  validateScenarioResearch,
} from "./persona-scenario-intelligence";
import type { ScenarioResearchItem } from "./persona-scenario-intelligence";

const source: ScenarioResearchItem = {
  id: "ref-piano-pov",
  url: "https://www.youtube.com/shorts/examplePianoPOV",
  platform: "youtube" as const,
  observedAt: "2026-10-30T10:00:00.000Z",
  observationStatus: "metadata_only" as const,
  title: "POV: композитор слышит правку режиссёра",
  evidence: { kind: "manual_link" as const, observedFields: ["url", "title"] },
};

describe("Persona Scenario Intelligence research core", () => {
  it("keeps a manual link metadata-only and rejects a duplicate evidence URL", () => {
    const [item] = validateScenarioResearch([source]);
    expect(item.observationStatus).toBe("metadata_only");
    expect(item.metrics).toBeUndefined();
    expect(() => validateScenarioResearch([source, { ...source, id: "duplicate" }])).toThrow(
      "Duplicate research URL",
    );
  });

  it("rejects a claimed viewed analysis without user-review evidence", () => {
    expect(() => analyseScenarioReference({ ...source, observationStatus: "user_reviewed" }, {
      observationStatus: "user_reviewed",
      hook: "Нельзя писать это как просмотренное видео",
      situation: "Репетиция",
      desire: "Попасть в тон",
      obstacle: "Несовпадение ожиданий",
      turn: "Герой слышит другую задачу",
      payoff: "Смысловой финал",
      editing: "Не указано",
      sound: "Не указано",
      productionComplexity: "low",
    })).toThrow("reviewedAt");
  });

  it("does not turn unavailable links or unsupported metrics into evidence", () => {
    expect(() => validateScenarioResearch([{
      ...source,
      metrics: { views: 1200 },
    }])).toThrow("metrics need evidence");
    expect(() => suggestScenarioIdeas({
      research: validateScenarioResearch([{ ...source, observationStatus: "unavailable" }]),
      creativeProfile: { priorities: [], constraints: [] },
      count: 5,
    })).toThrow("available research evidence");
  });

  it("proposes original ideas that retain a verified reference ID without inventing trend metrics", () => {
    const research = validateScenarioResearch([source]);
    const ideas = suggestScenarioIdeas({
      research,
      creativeProfile: {
        priorities: ["смысловые склейки", "естественный голос"],
        constraints: ["не менять внешность", "не копировать чужой сценарий"],
      },
      count: 5,
    });

    expect(ideas).toHaveLength(5);
    expect(ideas.every((idea) => idea.referenceIds.includes("ref-piano-pov"))).toBe(true);
    expect(ideas.every((idea) => idea.originalConflict.length > 10)).toBe(true);
    expect(ideas.every((idea) => !("visibleMetrics" in idea))).toBe(true);
  });
});
