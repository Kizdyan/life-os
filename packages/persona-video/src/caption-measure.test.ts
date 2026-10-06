import { describe, expect, it } from "vitest";
import { FfmpegCaptionTextMeasurer } from "./caption-measure";
import { createFixtureDirectory, createVideoFixture } from "../test/fixture";

describe("FfmpegCaptionTextMeasurer", () => {
  it("uses real local font glyph metrics for Cyrillic text", async () => {
    const directory = await createFixtureDirectory();
    const fixture = await createVideoFixture({ directory, durationSeconds: 1 });
    const measurer = new FfmpegCaptionTextMeasurer({
      ffmpegPath: fixture.ffmpegPath,
      runner: fixture.runner,
      workDirectory: directory,
      fontFilePath: "C:\\Windows\\Fonts\\arial.ttf",
      fontSizePx: 64,
    });

    const wide = await measurer.measureWidthPx("ШШШШШ");
    const narrow = await measurer.measureWidthPx("iiiiiiiiii");

    expect(wide).toBeGreaterThan(narrow);
    expect(wide).toBeGreaterThan(100);
  }, 30_000);
});
