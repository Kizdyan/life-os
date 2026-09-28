import { describe, expect, it } from "vitest";
import {
  learnFromFeedback,
  summarizeStyleDimension,
  type StyleMemoryStore,
} from "./style-memory";
import type { StyleMemoryObservation } from "./media-brain";

class MemoryStyleStore implements StyleMemoryStore {
  items: StyleMemoryObservation[] = [];

  async append(observation: StyleMemoryObservation): Promise<void> {
    this.items.push(observation);
  }

  async listByDimension(dimension: StyleMemoryObservation["dimension"]): Promise<StyleMemoryObservation[]> {
    return this.items.filter((item) => item.dimension === dimension);
  }
}

describe("Style Memory feedback learning", () => {
  it("stores only reusable high-confidence feedback", async () => {
    const store = new MemoryStyleStore();
    const learned = await learnFromFeedback({
      feedback: "Субтитры оставляем такими всегда, но этот конкретный кадр просто случайный.",
      assetId: "asset-1",
      projectId: "project-1",
      now: () => "2026-09-28T21:00:00.000Z",
      store,
      interpreter: {
        interpret: async () => [
          {
            dimension: "captions",
            value: "сохранять текущий стиль субтитров",
            confidence: 0.95,
            reusable: true,
          },
          {
            dimension: "framing",
            value: "использовать конкретный случайный кадр",
            confidence: 0.9,
            reusable: false,
          },
          {
            dimension: "color",
            value: "неуверенное предположение",
            confidence: 0.4,
            reusable: true,
          },
        ],
      },
    });

    expect(learned).toHaveLength(1);
    expect(learned[0].dimension).toBe("captions");
    expect(learned[0].signal).toBe("specific_feedback");
    expect(store.items).toHaveLength(1);
  });

  it("aggregates repeated preferences without treating one reference as truth", async () => {
    const store = new MemoryStyleStore();
    store.items.push(
      {
        assetId: "a",
        dimension: "editing",
        value: "чистые склейки без лишних эффектов",
        signal: "saved_reference",
        weight: 0.45,
        createdAt: "2026-09-28T20:00:00.000Z",
      },
      {
        assetId: "b",
        dimension: "editing",
        value: "чистые склейки без лишних эффектов",
        signal: "specific_feedback",
        weight: 0.82,
        createdAt: "2026-09-28T21:00:00.000Z",
      },
      {
        assetId: "c",
        dimension: "editing",
        value: "быстрые эффектные переходы",
        signal: "inferred",
        weight: 0.2,
        createdAt: "2026-09-28T22:00:00.000Z",
      },
    );

    const summary = await summarizeStyleDimension(store, "editing");
    expect(summary.preferred[0]).toEqual({
      value: "чистые склейки без лишних эффектов",
      score: 1.27,
      samples: 2,
    });
  });
});
