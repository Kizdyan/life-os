import { describe, expect, it } from "vitest";
import { VideoPipelineError, type ProcessRunner } from "./contracts";
import { parseProbeJson, probeVideo } from "./probe";

const rotatedWithAudio = JSON.stringify({
  format: {
    duration: "12.345",
    bit_rate: "2450000",
    size: "999999",
    tags: { creation_time: "2026-10-06T10:11:12.000000Z" },
  },
  streams: [
    {
      codec_type: "video",
      codec_name: "h264",
      width: 1920,
      height: 1080,
      avg_frame_rate: "30000/1001",
      side_data_list: [{ rotation: 90 }],
    },
    { codec_type: "audio", codec_name: "aac" },
  ],
});

describe("parseProbeJson", () => {
  it("normalizes rotated video metadata and rational FPS", () => {
    expect(parseProbeJson(rotatedWithAudio, "C:/clips/phone.mov", 1_234_567)).toEqual({
      inputPath: "C:/clips/phone.mov",
      durationMs: 12_345,
      width: 1080,
      height: 1920,
      orientation: "portrait",
      fps: 29.97002997002997,
      videoCodec: "h264",
      bitrate: 2_450_000,
      hasAudio: true,
      audioCodec: "aac",
      fileSizeBytes: 1_234_567,
      creationTime: "2026-10-06T10:11:12.000000Z",
      rotationDegrees: 90,
    });
  });

  it("keeps unknown optional metadata null for video without audio", () => {
    const raw = JSON.stringify({
      format: { duration: "2.5" },
      streams: [
        {
          codec_type: "video",
          codec_name: "hevc",
          width: 1280,
          height: 720,
          avg_frame_rate: "25/1",
        },
      ],
    });

    expect(parseProbeJson(raw, "clip.mp4", 456)).toMatchObject({
      durationMs: 2500,
      width: 1280,
      height: 720,
      orientation: "landscape",
      fps: 25,
      bitrate: null,
      hasAudio: false,
      audioCodec: null,
      creationTime: null,
      rotationDegrees: 0,
    });
  });

  it("rejects malformed ffprobe output with a machine-readable error", () => {
    expect(() => parseProbeJson("not-json", "bad.mp4", 10)).toThrowError(
      expect.objectContaining<Partial<VideoPipelineError>>({ code: "UNREADABLE_INPUT" }),
    );
  });
});

describe("probeVideo", () => {
  it("returns normalized metadata from an injected process boundary", async () => {
    const runner: ProcessRunner = {
      run: async () => ({ exitCode: 0, stdout: rotatedWithAudio, stderr: "" }),
    };

    const result = await probeVideo({
      inputPath: import.meta.filename,
      ffprobePath: "ffprobe-fixture",
      runner,
    });

    expect(result.inputPath).toBe(import.meta.filename);
    expect(result.orientation).toBe("portrait");
    expect(result.fileSizeBytes).toBeGreaterThan(0);
  });
});
