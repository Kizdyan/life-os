import { describe, expect, it } from "vitest";
import {
  advancePersonaProductionPipeline,
  startPersonaProductionPipeline,
} from "./persona-production-pipeline";

describe("Persona production pipeline", () => {
  it("advances one idea through script, shot list, brief, QA, and ready-for-shoot", () => {
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
    expect(pipeline.stage).toBe("READY_FOR_SHOOT");
    expect(pipeline.statuses.QA).toBe("completed");
    expect(pipeline.statuses.READY_FOR_SHOOT).toBe("completed");
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
});
