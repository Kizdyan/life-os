import { describe, expect, it } from "vitest";
import type { MediaAsset, MediaProject } from "./media-brain";
import {
  activeProjectIds,
  deriveProjectProjection,
  shouldAutoHideProject,
} from "./media-project-lifecycle";

const baseProject: MediaProject = {
  id: "project-1",
  title: "Rehearsal Reel",
  status: "in_project",
  assetIds: ["a", "b"],
  channelTargets: ["instagram"],
  approvalRequired: true,
  createdAt: "2026-09-29T10:00:00.000Z",
  updatedAt: "2026-09-29T10:00:00.000Z",
};

function asset(id: string, status: MediaAsset["status"]): MediaAsset {
  return {
    id,
    provider: "yandex",
    providerId: id,
    providerPath: `/Media/Projects/${id}.mov`,
    contentHash: id,
    mimeType: "video/mp4",
    source: "own_raw",
    section: "projects",
    status,
    projectId: "project-1",
    createdAt: null,
    importedAt: "2026-09-29T10:00:00.000Z",
    provenance: {
      originalProviderPath: `/Media/Inbox/${id}.mov`,
      originalProviderId: id,
      destructiveMoveVerified: false,
    },
  };
}

describe("Projects lifecycle", () => {
  it("keeps active work visible", () => {
    const projection = deriveProjectProjection(baseProject, [
      asset("a", "in_project"),
      asset("b", "analyzing"),
    ]);

    expect(projection.state).toBe("active");
    expect(projection.visibleInActiveProjects).toBe(true);
  });

  it("surfaces review-ready work without creating another folder", () => {
    const projection = deriveProjectProjection(baseProject, [
      asset("a", "ready_for_review"),
      asset("b", "in_project"),
    ]);

    expect(projection.state).toBe("ready_for_review");
    expect(projection.visibleInActiveProjects).toBe(true);
  });

  it("automatically hides fully published projects from the active view", () => {
    const assets = [asset("a", "published"), asset("b", "published")];
    const projection = deriveProjectProjection(baseProject, assets);

    expect(projection.state).toBe("published");
    expect(projection.visibleInActiveProjects).toBe(false);
    expect(shouldAutoHideProject(baseProject, assets)).toBe(true);
    expect(activeProjectIds([baseProject], assets)).toEqual([]);
  });

  it("treats archived and rejected project states as metadata, not visible folders", () => {
    const archived = { ...baseProject, status: "archived" as const };
    const rejected = { ...baseProject, status: "rejected" as const };

    expect(deriveProjectProjection(archived, []).state).toBe("archived");
    expect(deriveProjectProjection(rejected, []).state).toBe("rejected");
    expect(activeProjectIds([archived, rejected], [])).toEqual([]);
  });
});
