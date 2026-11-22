#!/usr/bin/env node
/**
 * Read-only media inspection. Requires ffprobe and ffmpeg executables.
 * Objective metadata only: all subjective QA fields deliberately remain null.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function run(binary, args, timeoutMs = 180000) {
  const result = spawnSync(binary, args, {
    encoding: "utf8", timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${binary} exited ${result.status}: ${(result.stderr || "").slice(-1500)}`);
  }
  return result;
}
function finitePositive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function frameRate(raw) {
  if (!raw || raw === "0/0") return null;
  const parts = raw.split("/");
  return parts.length === 2
    ? finitePositive(Number(parts[0]) / Number(parts[1]))
    : finitePositive(raw);
}
async function hashSha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}
function measureAudio(filePath) {
  const result = run("ffmpeg", [
    "-nostdin", "-hide_banner", "-i", filePath, "-vn",
    "-af", "ebur128=peak=true", "-f", "null", "-",
  ]);
  const summary = result.stderr.slice(result.stderr.lastIndexOf("Summary:"));
  const loudness = summary.match(/\bI:\s*(-?\d+(?:\.\d+)?)\s*LUFS/);
  const peak = summary.match(/\bPeak:\s*(-?\d+(?:\.\d+)?)\s*dBFS/);
  return {
    integratedLufs: loudness ? Number(loudness[1]) : null,
    truePeakDbfs: peak ? Number(peak[1]) : null,
  };
}
export async function inspectMedia(filePath, { measureLoudness = true } = {}) {
  const path = resolve(filePath);
  const info = JSON.parse(run("ffprobe", [
    "-v", "error", "-show_streams", "-show_format", "-of", "json", path,
  ], 30000).stdout);
  const video = info.streams?.find((s) => s.codec_type === "video");
  if (!video) throw new Error("No decodable video stream");
  const hasAudio = (info.streams ?? []).some((s) => s.codec_type === "audio");
  const measuredAudio = hasAudio && measureLoudness
    ? measureAudio(path)
    : { integratedLufs: null, truePeakDbfs: null };
  return {
    measuredFromRenderedFile: true,
    outputSha256: await hashSha256(path),
    width: finitePositive(video.width),
    height: finitePositive(video.height),
    fps: frameRate(video.avg_frame_rate || video.r_frame_rate),
    durationSeconds: finitePositive(video.duration) || finitePositive(info.format?.duration),
    hasAudio,
    ...measuredAudio,
    captionSyncP95Ms: null,
    captionsRequired: true,
    renderErrors: null,
    blackOrFrozenFrames: null,
    visibleArtifacts: null,
    identityPreserved: null,
    paletteApproved: null,
    mediaRightsCleared: null,
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: node scripts/inspect-video.mjs <local-video.mp4>");
    process.exitCode = 2;
  } else {
    inspectMedia(path)
      .then((result) => console.log(JSON.stringify(result, null, 2)))
      .catch((error) => { console.error(error.message); process.exitCode = 1; });
  }
}
