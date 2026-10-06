import { describe, expect, it } from "vitest";
import type { ProcessRunner, VideoMetadata } from "./contracts";
import { evaluateTechnicalQa, runTechnicalQa } from "./technical-qa";

const validMetadata: VideoMetadata = {
  inputPath: "fixture.mp4",
  durationMs: 12_000,
  width: 1080,
  height: 1920,
  orientation: "portrait",
  fps: 30,
  videoCodec: "h264",
  bitrate: 2_000_000,
  hasAudio: true,
  audioCodec: "aac",
  fileSizeBytes: 2_000_000,
  creationTime: null,
  rotationDegrees: 0,
};

describe("evaluateTechnicalQa", () => {
  it("passes a healthy decoded input", () => {
    expect(evaluateTechnicalQa(validMetadata, true)).toEqual({
      status: "PASS",
      decodedSuccessfully: true,
      findings: [],
    });
  });

  it("warns when audio is absent and the video is anomalously short", () => {
    const result = evaluateTechnicalQa(
      { ...validMetadata, hasAudio: false, audioCodec: null, durationMs: 900 },
      true,
      { minimumDurationMs: 1500 },
    );

    expect(result.status).toBe("WARNING");
    expect(result.findings.map((finding) => finding.code)).toEqual([
      "AUDIO_STREAM_MISSING",
      "DURATION_ANOMALOUSLY_SHORT",
    ]);
  });

  it("fails invalid dimensions, FPS and duration", () => {
    const result = evaluateTechnicalQa(
      {
        ...validMetadata,
        width: 0,
        height: 0,
        fps: 0,
        durationMs: 0,
        videoCodec: "unknown",
      },
      true,
    );

    expect(result.status).toBe("FAIL");
    expect(result.findings.map((finding) => finding.code)).toEqual([
      "RESOLUTION_INVALID",
      "FPS_INVALID",
      "DURATION_INVALID",
      "VIDEO_CODEC_UNKNOWN",
    ]);
  });

  it("fails a corrupt input even when ffprobe returned plausible metadata", () => {
    const result = evaluateTechnicalQa(validMetadata, false);

    expect(result.status).toBe("FAIL");
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "FULL_DECODE_FAILED", severity: "FAIL" }),
    );
  });
});

describe("runTechnicalQa", () => {
  it("converts an ffmpeg decode failure into a structured QA failure", async () => {
    const runner: ProcessRunner = {
      run: async () => ({ exitCode: 1, stdout: "", stderr: "Invalid data found" }),
    };

    const result = await runTechnicalQa({
      metadata: validMetadata,
      ffmpegPath: "ffmpeg-fixture",
      runner,
    });

    expect(result).toMatchObject({ status: "FAIL", decodedSuccessfully: false });
    expect(result.findings.at(-1)).toMatchObject({
      code: "FULL_DECODE_FAILED",
      details: { stderr: "Invalid data found" },
    });
  });
});
