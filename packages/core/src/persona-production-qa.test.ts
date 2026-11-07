import { describe, expect, it } from "vitest";
import { buildPersonaProductionBrief } from "./persona-production-brief";
import { evaluatePersonaProductionBrief } from "./persona-production-qa";

describe("evaluatePersonaProductionBrief", () => {
  it("requires fact review for free-form script claims even when the structure is complete", () => {
    const brief = buildPersonaProductionBrief({
      idea: {
        id: "idea-1",
        title: "Разбор репетиционного приёма",
        angle: "Показываю один приём, который помогает держать темп в репетиции.",
        format: "reel",
      },
      sourceFacts: ["Автор репетирует музыкальный материал."],
    });

    const result = evaluatePersonaProductionBrief({
      brief,
      allowedFacts: ["Автор репетирует музыкальный материал."],
    });

    expect(result.status).toBe("requires_fact_review");
    expect(result.structuralChecks.every((check) => check.passed)).toBe(true);
    expect(result.factReview.unverifiedFields).toContain("script[1].line");
    expect(result.factReview.message).toContain("не доказывает отсутствие выдуманных фактов");
    expect(result.editorialReview.state).toBe("pending");
    expect(result.editorialReview.questions).toContain(
      "Сохраняет ли материал индивидуальность автора?",
    );
  });

  it("flags missing production detail and unverifiable fact references without pretending to judge the video", () => {
    const brief = buildPersonaProductionBrief({
      idea: {
        id: "idea-2",
        title: "Рабочий ритуал",
        angle: "Показываю последовательность подготовки перед записью.",
        format: "short",
      },
    });
    brief.script[1].action = "";
    brief.shots[1].cameraMovement = "";
    brief.postProduction.subtitles.maxCharactersPerLine = 60;
    brief.factReferences = ["Неподтверждённый факт"];

    const result = evaluatePersonaProductionBrief({
      brief,
      allowedFacts: [],
    });

    expect(result.status).toBe("needs_revision");
    expect(result.structuralChecks.filter((check) => !check.passed).map((check) => check.id)).toEqual(
      expect.arrayContaining(["script-completeness", "shot-specificity", "subtitle-readability", "fact-references"]),
    );
    expect(result).not.toHaveProperty("videoQualityScore");
  });
  it("blocks approval of unsupported photo and carousel templates", () => {
    for (const format of ["photo", "carousel"] as const) {
      const brief = buildPersonaProductionBrief({
        idea: { id: format, title: "Портрет", angle: "Визуальная история", format },
      });
      expect(brief.script).toHaveLength(0);
      expect(brief.shots).toHaveLength(0);
      expect(evaluatePersonaProductionBrief({ brief, allowedFacts: [] }).status).toBe("needs_revision");
    }
  });

  it("scales spoken timing with a long creative brief and synchronizes all exports", () => {
    const brief = buildPersonaProductionBrief({
      idea: {
        id: "long-angle",
        title: "Театральная сцена",
        angle: Array.from({ length: 120 }, () => "репетиция").join(" "),
        format: "reel",
      },
    });
    expect(brief.script[1].durationSec).toBeGreaterThan(18);
    const total = brief.script.reduce((sum, beat) => sum + beat.durationSec, 0);
    expect(brief.shots.reduce((sum, shot) => sum + shot.durationSec, 0)).toBe(total);
    expect(brief.adaptations.reels.durationSec).toBe(total);
    expect(brief.adaptations.shorts.durationSec).toBe(total);
    expect(brief.adaptations.vkClips.durationSec).toBe(total);
  });

  it("rejects script and shot duration drift even when total export duration matches", () => {
    const brief = buildPersonaProductionBrief({
      idea: { id: "sync-1", title: "Репетиция", angle: "Действие в кадре", format: "reel" },
    });
    brief.script[1].durationSec += 3;
    const result = evaluatePersonaProductionBrief({ brief, allowedFacts: [] });
    expect(result.status).toBe("needs_revision");
    expect(result.structuralChecks.find(check => check.id === "script-shot-sync")?.passed).toBe(false);
  });

  it("rejects duplicate shot order while preserving duration", () => {
    const brief = buildPersonaProductionBrief({
      idea: { id: "sync-2", title: "Скетч", angle: "Показываю сцену", format: "reel" },
    });
    brief.shots[1].order = 1;
    const result = evaluatePersonaProductionBrief({ brief, allowedFacts: [] });
    expect(result.structuralChecks.find(check => check.id === "script-shot-sync")?.passed).toBe(false);
  });

});
