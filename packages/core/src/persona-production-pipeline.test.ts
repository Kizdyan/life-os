import { describe, expect, it } from "vitest";
import {
  advancePersonaProductionPipeline,
  recordPersonaEditorialDecision,
  startPersonaProductionPipeline,
} from "./persona-production-pipeline";

describe("Persona production pipeline", () => {
  it("requires an explicit fact-aware editorial approval after structural QA", () => {
    let pipeline = startPersonaProductionPipeline({
      idea: {
        id: "idea-1",
        title: "Разбор репетиционного приёма",
        angle: "Показываю один приём, который помогает держать темп в репетиции.",
        format: "reel",
      },
      sourceFacts: ["Автор репетирует музыкальный материал."],
    });

    pipeline = advancePersonaProductionPipeline(pipeline);
    expect(pipeline.stage).toBe("SCRIPT");
    expect(pipeline.materials.script).toHaveLength(3);

    pipeline = advancePersonaProductionPipeline(pipeline);
    expect(pipeline.stage).toBe("SHOT_LIST");
    expect(pipeline.materials.shotList).toHaveLength(3);

    pipeline = advancePersonaProductionPipeline(pipeline);
    expect(pipeline.stage).toBe("PRODUCTION_BRIEF");
    expect(pipeline.materials.productionBrief?.ideaId).toBe("idea-1");

    pipeline = advancePersonaProductionPipeline(pipeline);
    expect(pipeline.stage).toBe("QA");
    expect(pipeline.statuses.QA).toBe("requires_fact_review");
    expect(pipeline.statuses.READY_FOR_SHOOT).toBe("pending");

    pipeline = recordPersonaEditorialDecision(pipeline, {
      decision: "approved",
      editor: "Мария Редактор",
      comment: "Факты сверены с автором; можно снимать.",
      factReviewCompleted: true,
      decidedAt: "2026-10-27T12:00:00.000Z",
    });

    expect(pipeline.stage).toBe("READY_FOR_SHOOT");
    expect(pipeline.statuses.QA).toBe("completed");
    expect(pipeline.statuses.READY_FOR_SHOOT).toBe("completed");
    expect(pipeline.materials.editorialDecision).toMatchObject({
      decision: "approved",
      editor: "Мария Редактор",
    });
  });

  it("keeps earlier materials when QA requires revision", () => {
    let pipeline = startPersonaProductionPipeline({
      idea: {
        id: "idea-2",
        title: "Рабочий ритуал",
        angle: "Показываю последовательность подготовки перед записью.",
        format: "short",
      },
      sourceFacts: ["Разрешённый факт"],
      qaAllowedFacts: [],
    });

    pipeline = advancePersonaProductionPipeline(pipeline);
    pipeline = advancePersonaProductionPipeline(pipeline);
    pipeline = advancePersonaProductionPipeline(pipeline);
    pipeline = advancePersonaProductionPipeline(pipeline);

    expect(pipeline.stage).toBe("QA");
    expect(pipeline.statuses.QA).toBe("needs_revision");
    expect(pipeline.materials.script).toHaveLength(3);
    expect(pipeline.materials.shotList).toHaveLength(3);
    expect(pipeline.materials.productionBrief?.factReferences).toEqual(["Разрешённый факт"]);
  });

  it("keeps script, shot list, and brief when an editor rejects a structurally valid material", () => {
    let pipeline = startPersonaProductionPipeline({
      idea: {
        id: "idea-3",
        title: "Разговор о репетиции",
        angle: "Показываю подготовку перед записью.",
        format: "reel",
      },
    });

    pipeline = advancePersonaProductionPipeline(pipeline);
    pipeline = advancePersonaProductionPipeline(pipeline);
    pipeline = advancePersonaProductionPipeline(pipeline);
    pipeline = advancePersonaProductionPipeline(pipeline);

    const rejected = recordPersonaEditorialDecision(pipeline, {
      decision: "rejected",
      editor: "Мария Редактор",
      comment: "Уточнить утверждение в центральной реплике.",
      decidedAt: "2026-10-27T12:00:00.000Z",
    });

    expect(rejected.stage).toBe("QA");
    expect(rejected.statuses.QA).toBe("needs_revision");
    expect(rejected.statuses.READY_FOR_SHOOT).toBe("pending");
    expect(rejected.materials.script).toHaveLength(3);
    expect(rejected.materials.shotList).toHaveLength(3);
    expect(rejected.materials.productionBrief?.ideaId).toBe("idea-3");
  });
  it("refuses stale approvals at the core boundary after an idea edit", () => {
    let pipeline = startPersonaProductionPipeline({
      idea: { id: "edited", title: "Сцена", angle: "Первоначальная идея", format: "reel" },
    });
    for (let i = 0; i < 4; i++) pipeline = advancePersonaProductionPipeline(pipeline);
    pipeline = {
      ...pipeline,
      input: { ...pipeline.input, idea: { ...pipeline.input.idea, angle: "Новая идея" } },
    };
    expect(() => recordPersonaEditorialDecision(pipeline, {
      decision: "approved", editor: "Редактор", comment: "Проверено",
      factReviewCompleted: true, decidedAt: "2026-10-27T12:00:00.000Z",
    })).toThrow(/idea changed/);
  });

});
