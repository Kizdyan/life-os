import { describe, expect, it } from "vitest";
import * as pipelineModule from "./persona-production-pipeline";

const firstReelBrief = {
  version: 1,
  ideaId: "editorial-bank-one-day-theater-music",
  sourceAngle: "Соединить две профессии одной историей",
  sourceTitle: "Один день между театром и музыкой",
  sourceFormat: "reel",
  hook: {
    firstSeconds: "Я актёр. И ещё пишу музыку.",
    visual: "Первый кадр сразу крупным планом",
    delivery: "Взгляд в объектив; первая реплика начинается в первые секунды",
  },
  script: [
    [3, "Я актёр. И ещё пишу музыку."],
    [4, "И у нас есть проблема."],
    [5, "Завтра проба. Надо выучить текст."],
    [5, "А к утру — дописать аранжировку."],
    [4, "То есть спать мы не будем?"],
    [6, "Почему? Сейчас напишу колыбельную."],
    [4, "Это колыбельная? Это финал триллера."],
  ].map(([durationSec, line], index) => ({
    order: index + 1,
    durationSec,
    line,
    action: "Снять 2–3 дубля без неподтверждённых фактов.",
  })),
  shots: ["close-up", "medium", "medium", "medium", "close-up", "medium", "close-up"].map((framing, index) => ({
    order: index + 1,
    durationSec: [3, 4, 5, 5, 4, 6, 4][index],
    framing,
    angle: "Конкретный ракурс для кадра",
    cameraMovement: "Статичный кадр",
    lighting: "Мягкий устойчивый свет",
    action: "Действие кадра",
  })),
  capture: {
    props: ["Смартфон"], wardrobe: "Обычная одежда", location: "Домашняя студия", lighting: "Мягкий свет",
    audio: { recording: "Речь близко к микрофону", processing: "Сохранить естественный голос" },
  },
  postProduction: {
    transitions: "Жёсткие склейки по паузам",
    subtitles: { instruction: "Две строки в безопасной зоне", maxCharactersPerLine: 42 },
    color: "Без изменения лица и естественного цвета",
  },
  adaptations: Object.fromEntries(["reels", "shorts", "vkClips"].map(platform => [platform, {
    aspectRatio: "9:16", durationSec: 31, instruction: "Вертикальная версия",
  }])),
  factReferences: [],
};

describe("Persona production brief import", () => {
  it("imports the seven-shot 31-second first-Reels brief into QA for the selected matching idea", () => {
    const imported = (pipelineModule as Record<string, unknown>).importPersonaProductionBrief as undefined | ((input: unknown) => any);
    expect(typeof imported).toBe("function");
    const pipeline = imported!({
      brief: firstReelBrief,
      selectedIdea: {
        id: "local-8",
        title: firstReelBrief.sourceTitle,
        angle: firstReelBrief.sourceAngle,
        format: "reel",
      },
    });
    expect(pipeline.stage).toBe("QA");
    expect(pipeline.materials.productionBrief.ideaId).toBe("local-8");
    expect(pipeline.materials.script).toHaveLength(7);
    expect(pipeline.materials.shotList).toHaveLength(7);
    expect(pipeline.materials.productionBrief.adaptations.reels.durationSec).toBe(31);
    expect(pipeline.materials.qa.status).toBe("requires_fact_review");
    expect(pipeline.materials.editorialDecision).toBeUndefined();
  });

  it("rejects a malformed or mismatched imported brief before it can replace a plan", () => {
    const imported = (pipelineModule as Record<string, unknown>).importPersonaProductionBrief as undefined | ((input: unknown) => any);
    expect(() => imported!({ brief: { ...firstReelBrief, shots: firstReelBrief.shots.slice(1) } })).toThrow();
    expect(() => imported!({
      brief: firstReelBrief,
      selectedIdea: { id: "other", title: "Другая идея", angle: "Другой смысл", format: "reel" },
    })).toThrow(/selected idea/i);
  });

  it("re-runs QA and removes a prior approval after one line is edited", () => {
    const imported = (pipelineModule as Record<string, unknown>).importPersonaProductionBrief as (input: unknown) => any;
    const approve = (pipelineModule as Record<string, unknown>).recordPersonaEditorialDecision as (pipeline: any, decision: unknown) => any;
    const revise = (pipelineModule as Record<string, unknown>).revisePersonaProductionBrief as (pipeline: any, brief: unknown) => any;
    const pipeline = imported({
      brief: firstReelBrief,
      selectedIdea: { id: "local-8", title: firstReelBrief.sourceTitle, angle: firstReelBrief.sourceAngle, format: "reel" },
    });
    const approved = approve(pipeline, {
      decision: "approved",
      editor: "Редактор",
      comment: "Факты проверены.",
      factReviewCompleted: true,
      decidedAt: "2026-10-29T12:00:00.000Z",
    });
    expect(approved.stage).toBe("READY_FOR_SHOOT");

    const edited = revise(approved, {
      ...approved.materials.productionBrief,
      script: approved.materials.productionBrief.script.map((beat: any, index: number) => index === 0
        ? { ...beat, line: "Я актёр и сам пишу музыку." }
        : beat),
    });

    expect(edited.stage).toBe("QA");
    expect(edited.statuses.READY_FOR_SHOOT).toBe("pending");
    expect(edited.materials.editorialDecision).toBeUndefined();
    expect(edited.materials.script[0].line).toBe("Я актёр и сам пишу музыку.");
    expect(edited.materials.qa).toBeDefined();
  });
});
