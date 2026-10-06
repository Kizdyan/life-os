import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ProcessRunner } from "./contracts";
import { renderAtomically } from "./render-utils";
import { createFixtureDirectory } from "../test/fixture";

describe("renderAtomically", () => {
  it("keeps the temporary media path short enough for legacy Windows ffprobe", async () => {
    const root = await createFixtureDirectory();
    let directory = root;
    while (directory.length < 225) {
      directory = join(directory, "nested-output");
    }
    await mkdir(directory, { recursive: true });

    const runner: ProcessRunner = {
      async run(_command, args) {
        const mediaPath = args.at(-1) ?? "";
        if (mediaPath.length > 259) {
          throw new Error(`legacy ffprobe cannot open ${mediaPath.length}-character path`);
        }
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            format: { duration: "1", size: "1" },
            streams: [{ codec_type: "video", codec_name: "h264", width: 16, height: 16 }],
          }),
          stderr: "",
        };
      },
    };

    const outputPath = join(directory, "normalized-rough-cut.mp4");
    const result = await renderAtomically({
      outputPath,
      ffprobePath: "legacy-ffprobe.exe",
      runner,
      render: async (temporaryPath) => {
        await writeFile(temporaryPath, "media");
      },
    });

    expect(result.path).toBe(outputPath);
  });
});
