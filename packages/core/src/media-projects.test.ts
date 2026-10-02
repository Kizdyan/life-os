import { describe, expect, it } from "vitest";
import type {
  MediaAsset,
  MediaProject,
  MediaStorageEntry,
  MediaStorageProvider,
} from "./media-brain";
import {
  assignAssetToProject,
  materializeAssetInProject,
  type MediaProjectStore,
} from "./media-projects";

class ProjectStore implements MediaProjectStore {
  byKey = new Map<string, MediaProject>();

  async findActiveByKey(key: string): Promise<MediaProject | null> {
    return this.byKey.get(key) ?? null;
  }

  async save(project: MediaProject, key: string): Promise<void> {
    this.byKey.set(key, project);
  }
}

const asset: MediaAsset = {
  id: "asset-1",
  provider: "yandex",
  providerId: "remote-1",
  providerPath: "/Media/Inbox/rehearsal.mov",
  contentHash: "hash",
  mimeType: "video/quicktime",
  source: "own_raw",
  section: "inbox",
  status: "ingested",
  projectId: null,
  createdAt: null,
  importedAt: "2026-09-29T10:00:00.000Z",
  provenance: {
    originalProviderPath: "/Media/Inbox/rehearsal.mov",
    originalProviderId: "remote-1",
    destructiveMoveVerified: false,
  },
};

describe("automatic media projects", () => {
  it("creates a project once and keeps later matching assets in the same project", async () => {
    const store = new ProjectStore();
    let id = 0;

    const first = await assignAssetToProject({
      asset,
      hint: {
        key: "life-item:rehearsal-2026-09-29",
        title: "Репетиция — backstage",
        channelTargets: ["instagram"],
      },
      store,
      now: "2026-09-29T10:00:00.000Z",
      createProjectId: () => `project-${++id}`,
    });

    const secondAsset = { ...asset, id: "asset-2", providerId: "remote-2" };
    const second = await assignAssetToProject({
      asset: secondAsset,
      hint: {
        key: "life-item:rehearsal-2026-09-29",
        title: "Репетиция — backstage",
        channelTargets: ["instagram", "youtube"],
      },
      store,
      now: "2026-09-29T10:05:00.000Z",
      createProjectId: () => `project-${++id}`,
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.project.id).toBe(first.project.id);
    expect(second.project.assetIds).toEqual(["asset-1", "asset-2"]);
    expect(second.project.channelTargets).toEqual(["instagram", "youtube"]);
    expect(second.asset).toMatchObject({
      section: "projects",
      status: "in_project",
      projectId: first.project.id,
    });
  });

  it("copies source into Projects and verifies the copy without deleting Inbox original", async () => {
    const copied: Array<[string, string]> = [];
    const created: string[] = [];
    const provider: MediaStorageProvider = {
      id: "yandex",
      list: async () => [],
      stat: async (path): Promise<MediaStorageEntry | null> => ({
        id: path,
        path,
        name: "rehearsal.mov",
        mimeType: "video/quicktime",
        size: 100,
        modifiedAt: null,
        contentHash: "hash",
      }),
      createFolder: async (path) => {
        created.push(path);
      },
      upload: async () => undefined,
      move: async () => {
        throw new Error("source must not be moved");
      },
      copy: async (from, to) => {
        copied.push([from, to]);
      },
      archive: async () => undefined,
    };

    const result = await materializeAssetInProject({
      provider,
      rootPath: "/Media",
      asset,
      projectId: "project-1",
    });

    expect(result.projectPath).toBe("/Media/Projects/project-1");
    expect(result.copiedPath).toBe(
      "/Media/Projects/project-1/source/rehearsal.mov",
    );
    expect(copied).toEqual([
      [
        "/Media/Inbox/rehearsal.mov",
        "/Media/Projects/project-1/source/rehearsal.mov",
      ],
    ]);
    expect(created).toEqual([
      "/Media/Projects/project-1",
      "/Media/Projects/project-1/source",
    ]);
  });
});
