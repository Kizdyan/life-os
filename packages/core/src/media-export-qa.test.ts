import { describe, it, expect } from "vitest";
import { assessPersonaReelExport, type MediaExportEvidence } from "./media-export-qa";
const good: MediaExportEvidence = {
  measuredFromRenderedFile: true, outputSha256: "f".repeat(64),
  width: 1080, height: 1920, fps: 30, durationSeconds: 38,
  hasAudio: true, integratedLufs: -14, truePeakDbfs: -1.5,
  captionSyncP95Ms: 50, captionsRequired: true,
  renderErrors: 0, blackOrFrozenFrames: 0, visibleArtifacts: 0,
  identityPreserved: true, paletteApproved: true, mediaRightsCleared: true,
};
describe("Persona video QA", () => {
  it("passes verified quality evidence", () => {
    expect(assessPersonaReelExport(good).status).toBe("pass");
  });
  it("never passes absent render evidence", () => {
    expect(assessPersonaReelExport({ ...good, measuredFromRenderedFile: false }).status)
      .toBe("review_required");
  });
  it("rejects low-resolution and wrong-aspect footage", () => {
    const r = assessPersonaReelExport({ ...good, width: 512, height: 910 });
    expect(r.status).toBe("fail");
  });
  it("rejects loud audio or clipping", () => {
    const r = assessPersonaReelExport({ ...good, integratedLufs: -5, truePeakDbfs: 0 });
    expect(r.blockers).toHaveLength(2);
  });
  it("requires subtitles in sync", () => {
    expect(assessPersonaReelExport({ ...good, captionSyncP95Ms: 200 }).status).toBe("fail");
  });
  it("blocks missing visual identity review", () => {
    expect(assessPersonaReelExport({ ...good, identityPreserved: null }).status)
      .toBe("review_required");
  });
  it("blocks identity alteration, palette mismatch or unclear rights", () => {
    expect(assessPersonaReelExport({ ...good, identityPreserved: false }).status).toBe("fail");
    expect(assessPersonaReelExport({ ...good, paletteApproved: false }).status).toBe("fail");
    expect(assessPersonaReelExport({ ...good, mediaRightsCleared: false }).status).toBe("fail");
  });
  it("detects render defects", () => {
    expect(assessPersonaReelExport({ ...good, visibleArtifacts: 1 }).status).toBe("fail");
  });
});