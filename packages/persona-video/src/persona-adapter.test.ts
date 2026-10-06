import { describe, expect, it, vi } from "vitest";
import { toVideoProcessingRequest } from "./persona-adapter";

describe("toVideoProcessingRequest", () => {
  it("maps only the narrow media-processing boundary", () => {
    const onProgress = vi.fn();
    const request = toVideoProcessingRequest({
      ideaId: "idea-17",
      shootingResultId: "shooting-42",
      assetId: "asset-9",
      localInputPath: "C:\\captures\\take 01.mp4",
      outputRoot: "C:\\renders\\persona-video",
      reframeInstruction: { mode: "CENTER" },
      onProgress,
    });

    expect(request).toEqual({
      inputPath: "C:\\captures\\take 01.mp4",
      outputRoot: "C:\\renders\\persona-video",
      reframeInstruction: { mode: "CENTER" },
      onProgress,
    });
    expect(request).not.toHaveProperty("ideaId");
    expect(request).not.toHaveProperty("shootingResultId");
    expect(request).not.toHaveProperty("assetId");
  });
});
