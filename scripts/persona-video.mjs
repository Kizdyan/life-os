import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";

const buildDirectory = await mkdtemp(join(tmpdir(), "persona-video-cli-"));
const bundlePath = join(buildDirectory, "persona-video-cli.mjs");

try {
  await build({
    entryPoints: ["packages/persona-video/src/cli.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    outfile: bundlePath,
    external: ["ffmpeg-static", "ffprobe-static"],
  });

  const env = { ...process.env };
  if (!toolsAvailableOnPath()) {
    const ffmpeg = (await import("ffmpeg-static")).default;
    const ffprobe = (await import("ffprobe-static")).default.path;
    env.FFMPEG_PATH ||= ffmpeg;
    env.FFPROBE_PATH ||= ffprobe;
  }
  const child = spawnSync(process.execPath, [bundlePath, ...process.argv.slice(2)], {
    stdio: "inherit",
    shell: false,
    env,
  });
  process.exitCode = child.status ?? 1;
} finally {
  await rm(buildDirectory, { recursive: true, force: true });
}

function toolsAvailableOnPath() {
  return ["ffmpeg", "ffprobe"].every((command) => {
    const result = spawnSync(command, ["-version"], {
      stdio: "ignore",
      shell: false,
      windowsHide: true,
    });
    return result.status === 0;
  });
}
