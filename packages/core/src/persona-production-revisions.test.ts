import { describe, expect, it } from "vitest";
import {
  advancePersonaProductionPipeline,
  recordPersonaEditorialDecision,
  revisePersonaProductionPipeline,
  startPersonaProductionPipeline,
} from "./persona-production-pipeline";

function atQa() {
  let pipeline = startPersonaProductionPipeline({
    idea: {
      id: "revision-idea",
      title: "Наблюдение после репетиции",
      angle: "Первый вариант наблюдения.",
      format: "reel",
    },
  });
  for (let step = 0; step < 4; step += 1) pipeline = advancePersonaProductionPipeline(pipeline);
  return pipeline;
}

describe("Persona production revisions", () => {
  it("archives the reviewed material and requires a fresh QA after an edit", () => {
    const original = atQa();
    const revised = revisePersonaProductionPipeline(original, {
      angle: "Уточнённый вариант наблюдения.",
      reason: "Автор уточнил смысл идеи.",
    });

    expect(original.revision).toBe(1);
    expect(revised.revision).toBe(2);
    expect(revised.stage).toBe("IDEA");
    expect(revised.materials.productionBrief).toBeUndefined();
    expect(revised.archivedRevisions).toEqual([
      expect.objectContaining({ revision: 1, reason: "Автор уточнил смысл идеи." }),
    ]);

    let rechecked = revised;
    for (let step = 0; step < 4; step += 1) rechecked = advancePersonaProductionPipeline(rechecked);
    expect(rechecked.stage).toBe("QA");
    expect(rechecked.materials.productionBrief?.script[1]?.line).toBe("Уточнённый вариант наблюдения.");
  });

  it("rejects an editorial decision tied to an older revision", () => {
    const revised = revisePersonaProductionPipeline(atQa(), {
      angle: "Новая формулировка.",
      reason: "Редактура автора.",
    });
    let rechecked = revised;
    for (let step = 0; step < 4; step += 1) rechecked = advancePersonaProductionPipeline(rechecked);

    expect(() => recordPersonaEditorialDecision(rechecked, {
      decision: "approved",
      editor: "Редактор",
      comment: "Проверено",
      factReviewCompleted: true,
      expectedRevision: 1,
      decidedAt: "2026-10-27T12:00:00.000Z",
    })).toThrow("different revision");
  });

  it("keeps rejected material in an auditable revision history", () => {
    const rejected = recordPersonaEditorialDecision(atQa(), {
      decision: "rejected",
      editor: "Редактор",
      comment: "Нужно вернуть живое действие во второй кадр.",
      decidedAt: "2026-10-27T12:00:00.000Z",
    });

    expect(rejected.stage).toBe("QA");
    expect(rejected.materials.productionBrief).toBeDefined();
    expect(rejected.revisionHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({ revision: 1, event: "editorial_rejected" }),
    ]));
  });
});
