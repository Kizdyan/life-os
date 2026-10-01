import { describe, expect, it } from "vitest";
import { PERSONAL_FORMAT_SEEDS } from "./personal-format-seed";

describe("Kostya personal Format Memory seed", () => {
  it("contains the reusable presentation mechanics extracted from the reference batch", () => {
    expect(PERSONAL_FORMAT_SEEDS.map((item) => item.formatKey)).toEqual([
      "demo-tool",
      "chronological-story",
      "resource-roundup",
      "one-rule-metaphor",
    ]);
  });

  it("stores them as weak reference signals rather than proven audience winners", () => {
    for (const seed of PERSONAL_FORMAT_SEEDS) {
      expect(seed.userSignal).toBe("saved_reference");
      expect(seed.audienceSignal).toBe("unknown");
      expect(seed.mechanics.length).toBeGreaterThan(1);
    }
  });

  it("contains presentation mechanics, not the factual claims of the source videos", () => {
    const text = JSON.stringify(PERSONAL_FORMAT_SEEDS).toLowerCase();

    expect(text).not.toContain("квант");
    expect(text).not.toContain("миллион");
    expect(text).not.toContain("быстрый секс");
    expect(text).not.toContain("копировать сделки");
  });
});
