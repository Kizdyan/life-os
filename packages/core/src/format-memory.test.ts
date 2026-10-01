import { describe, expect, it } from "vitest";
import {
  buildFormatObservation,
  summarizeFormatMemory,
} from "./format-memory";

describe("Format Memory", () => {
  it("stores format mechanics separately from the truth of a video's claims", () => {
    const observation = buildFormatObservation({
      formatKey: "chronological-story",
      label: "История по возрастам",
      mechanics: ["возраст", "поворот", "следующий возраст", "результат"],
      sourceAssetId: "reference-5",
      userSignal: "saved_reference",
      audienceSignal: "unknown",
      createdAt: "2026-10-01T12:00:00+03:00",
    });

    expect(observation.userFitWeight).toBeGreaterThan(0);
    expect(observation.audienceWeight).toBe(0);
    expect(observation.mechanics).toContain("поворот");
  });

  it("keeps user fit and audience response as separate scores", () => {
    const summary = summarizeFormatMemory([
      buildFormatObservation({
        formatKey: "one-rule-metaphor",
        label: "Одно правило + метафора",
        mechanics: ["одно правило", "визуальная метафора"],
        sourceAssetId: "reference-8",
        userSignal: "explicit_approval",
        audienceSignal: "unknown",
        createdAt: "2026-10-01T12:00:00+03:00",
      }),
      buildFormatObservation({
        formatKey: "loud-trend-hook",
        label: "Громкий трендовый хук",
        mechanics: ["громкое обещание", "быстрые склейки"],
        sourceAssetId: "reference-x",
        userSignal: "inferred",
        audienceSignal: "strong",
        createdAt: "2026-10-01T12:01:00+03:00",
      }),
    ]);

    const preferred = summary.formats.find(
      (item) => item.formatKey === "one-rule-metaphor",
    )!;
    const viral = summary.formats.find(
      (item) => item.formatKey === "loud-trend-hook",
    )!;

    expect(preferred.userFitScore).toBeGreaterThan(viral.userFitScore);
    expect(viral.audienceScore).toBeGreaterThan(preferred.audienceScore);
  });

  it("does not collapse taste and performance into one magic score", () => {
    const summary = summarizeFormatMemory([
      buildFormatObservation({
        formatKey: "demo-tool",
        label: "Вау-инструмент + демонстрация",
        mechanics: ["сильный тезис", "демонстрация экрана"],
        sourceAssetId: "reference-2",
        userSignal: "saved_reference",
        audienceSignal: "mixed",
        createdAt: "2026-10-01T12:00:00+03:00",
      }),
    ]);

    expect(summary.formats[0]).toHaveProperty("userFitScore");
    expect(summary.formats[0]).toHaveProperty("audienceScore");
    expect(summary.formats[0]).not.toHaveProperty("overallScore");
  });
});
