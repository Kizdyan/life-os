import { describe, expect, it } from "vitest";
import {
  DEFAULT_MEDIA_CAPABILITIES,
  PERSONAL_HIGH_AUTONOMY_MEDIA,
  canPublishWithoutApproval,
  makeStyleObservation,
  mediaAssetKey,
  mediaSectionPath,
  styleSignalWeight,
} from "./media-brain";
import {
  DEFAULT_YANDEX_DISK_CONFIG,
  normalizeDiskPath,
  yandexAuthHeaders,
  yandexMoveUrl,
  yandexSectionPath,
  yandexUploadLinkUrl,
} from "./yandex-disk";

describe("Media Brain", () => {
  it("keeps only three user-visible sections", () => {
    expect(mediaSectionPath("/Apps/Kostya Media Brain", "inbox")).toBe(
      "/Apps/Kostya Media Brain/Inbox",
    );
    expect(mediaSectionPath("/Apps/Kostya Media Brain/", "references")).toBe(
      "/Apps/Kostya Media Brain/References",
    );
    expect(mediaSectionPath("/", "projects")).toBe("/Projects");
  });

  it("gates personal high-autonomy behavior behind capabilities", () => {
    expect(DEFAULT_MEDIA_CAPABILITIES.autoEditVideo).toBe(false);
    expect(DEFAULT_MEDIA_CAPABILITIES.useDiveMPrePublishAnalysis).toBe(false);
    expect(PERSONAL_HIGH_AUTONOMY_MEDIA.autoEditVideo).toBe(true);
    expect(PERSONAL_HIGH_AUTONOMY_MEDIA.useDiveMPrePublishAnalysis).toBe(true);
    expect(canPublishWithoutApproval(PERSONAL_HIGH_AUTONOMY_MEDIA)).toBe(false);
  });

  it("weights explicit user signals above inferred preferences", () => {
    expect(styleSignalWeight("published")).toBeGreaterThan(styleSignalWeight("saved_reference"));
    expect(styleSignalWeight("specific_feedback")).toBeGreaterThan(styleSignalWeight("inferred"));

    const observation = makeStyleObservation({
      assetId: "asset-1",
      dimension: "editing",
      value: "короткие паузы и чистые склейки",
      signal: "specific_feedback",
      createdAt: "2026-09-28T00:00:00.000Z",
    });
    expect(observation.weight).toBe(styleSignalWeight("specific_feedback"));
  });

  it("builds stable idempotency keys", () => {
    expect(mediaAssetKey("yandex", "/Inbox//clip.mov/", "abc")).toBe(
      "yandex:/Inbox/clip.mov:abc",
    );
  });
});

describe("Yandex.Disk adapter helpers", () => {
  it("normalizes paths and maps the minimal folder model", () => {
    expect(normalizeDiskPath("\\Apps\\Media//Inbox/")).toBe("/Apps/Media/Inbox");
    expect(yandexSectionPath(DEFAULT_YANDEX_DISK_CONFIG.rootPath, "references")).toBe(
      "/Apps/Kostya Media Brain/References",
    );
  });

  it("builds upload and move URLs without losing unicode paths", () => {
    const upload = new URL(yandexUploadLinkUrl("/Apps/Kostya Media Brain/Inbox/репетиция.mov"));
    expect(upload.pathname).toBe("/v1/disk/resources/upload");
    expect(upload.searchParams.get("path")).toBe(
      "/Apps/Kostya Media Brain/Inbox/репетиция.mov",
    );
    expect(upload.searchParams.get("overwrite")).toBe("false");

    const move = new URL(
      yandexMoveUrl(
        "/Apps/Kostya Media Brain/Inbox/a.mov",
        "/Apps/Kostya Media Brain/Projects/a.mov",
      ),
    );
    expect(move.searchParams.get("from")).toContain("/Inbox/a.mov");
    expect(move.searchParams.get("path")).toContain("/Projects/a.mov");
  });

  it("requires explicit OAuth token input", () => {
    expect(() => yandexAuthHeaders("")).toThrow("OAuth token");
    expect(yandexAuthHeaders(" token ")).toEqual({ Authorization: "OAuth token" });
  });
});
