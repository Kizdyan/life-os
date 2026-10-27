import { describe, expect, it } from "vitest";
import { assessPersonaMedia } from "./persona-media";

describe("Persona local media assessment", () => {
  it("reports a real vertical video as ready for a non-destructive edit plan", () => {
    const result = assessPersonaMedia({
      kind: "video",
      name: "portrait.mp4",
      mimeType: "video/mp4",
      byteSize: 18_000_000,
      width: 1080,
      height: 1920,
      durationSec: 28.4,
      fps: null,
      audio: "unavailable_in_browser",
      exposure: "unavailable_in_browser",
    });

    expect(result.orientation).toBe("portrait");
    expect(result.status).toBe("ready_for_edit_plan");
    expect(result.safeOutput).toBe("editor_package_only");
    expect(result.notes).toContain("Исходный файл не изменён.");
  });

  it("does not claim that a landscape video can be exported vertically without a renderer", () => {
    const result = assessPersonaMedia({
      kind: "video",
      name: "landscape.mp4",
      mimeType: "video/mp4",
      byteSize: 18_000_000,
      width: 1920,
      height: 1080,
      durationSec: 28.4,
      fps: null,
      audio: "unavailable_in_browser",
      exposure: "unavailable_in_browser",
    });

    expect(result.orientation).toBe("landscape");
    expect(result.status).toBe("needs_vertical_edit");
    expect(result.safeOutput).toBe("editor_package_only");
  });

  it("permits a portrait photo to use the browser's contained-canvas export without cropping a face", () => {
    const result = assessPersonaMedia({
      kind: "image",
      name: "portrait.jpg",
      mimeType: "image/jpeg",
      byteSize: 2_000_000,
      width: 1600,
      height: 2400,
      durationSec: null,
      fps: null,
      audio: "not_applicable",
      exposure: "unavailable_in_browser",
    });

    expect(result.status).toBe("ready_for_safe_photo_export");
    expect(result.safeOutput).toBe("contained_canvas_jpeg");
    expect(result.notes).toContain("без обрезки и изменения геометрии");
  });
});
