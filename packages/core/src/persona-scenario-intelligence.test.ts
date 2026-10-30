import { describe, expect, it } from "vitest";
import {
  analyseScenarioReference,
  approveScenarioScript,
  createScenarioScript,
  reviewScenarioScript,
  reviseScenarioScript,
  scenarioScriptToProductionBriefInput,
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

  it("keeps dramaturg, director and producer criticism separate and blocks an unshootable draft", () => {
    const [idea] = suggestScenarioIdeas({
      research: validateScenarioResearch([source]),
      creativeProfile: { priorities: [], constraints: [] },
      count: 5,
    });
    const script = createScenarioScript(idea, {
      createdAt: "2026-10-30T10:00:00.000Z",
      beats: [{ purpose: "development", line: "Ну вот", action: "", durationSec: 2 }],
    });
    const review = reviewScenarioScript(script.currentRevision);

    expect(review.status).toBe("needs_revision");
    expect(new Set(review.findings.map((finding) => finding.role))).toEqual(
      new Set(["dramaturg", "director", "producer"]),
    );
    expect(review.findings.some((finding) => finding.severity === "blocking")).toBe(true);
  });

  it("preserves the rejected revision, clears approval after an edit, and only converts an approved script", () => {
    const [idea] = suggestScenarioIdeas({
      research: validateScenarioResearch([source]),
      creativeProfile: { priorities: ["смысловые склейки"], constraints: [] },
      count: 5,
    });
    const draft = createScenarioScript(idea, {
      createdAt: "2026-10-30T10:00:00.000Z",
      beats: [
        { purpose: "hook", line: "Я пришёл сыграть один дубль — и получил три противоречивые задачи.", action: "Взгляд в объектив, затем пауза.", durationSec: 5 },
        { purpose: "development", line: "Я меняю интонацию, пока пианино честнее меня комментирует каждую правку.", action: "Переход к клавишам и рукам.", durationSec: 8 },
        { purpose: "ending", line: "В итоге лучший дубль начинается после того, как я перестал играть задачу.", action: "Вернуться в крупный план и оставить реакцию.", durationSec: 6 },
      ],
    });
    const approved = approveScenarioScript(draft, {
      author: "Kostya",
      comment: "Можно переводить в съёмочный бриф.",
      approvedAt: "2026-10-30T10:05:00.000Z",
    });
    const input = scenarioScriptToProductionBriefInput(approved);
    const revised = reviseScenarioScript(approved, {
      createdAt: "2026-10-30T10:10:00.000Z",
      beats: approved.currentRevision.beats.map((beat) => ({
        ...beat,
        line: beat.purpose === "hook" ? "Я пришёл сыграть один дубль — и получил четыре задачи." : beat.line,
      })),
      reason: "Автор уточнил хук.",
    });

    expect(input.idea.id).toBe(idea.id);
    expect(approved.approval?.author).toBe("Kostya");
    expect(revised.revisions).toHaveLength(2);
    expect(revised.approval).toBeUndefined();
    expect(() => scenarioScriptToProductionBriefInput(revised)).toThrow("author approval");
  });
});
