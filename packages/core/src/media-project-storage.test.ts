import { describe, expect, it } from "vitest";
import type { MediaStorageEntry, MediaStorageProvider } from "./media-brain";
import { writeEditorBundleToProjects } from "./media-project-storage";

class MemoryProvider implements MediaStorageProvider {
  readonly id = "memory";
  created: string[] = [];
  uploaded = new Map<string, Uint8Array>();

  async list(): Promise<MediaStorageEntry[]> {
    return [];
  }

  async stat(path: string): Promise<MediaStorageEntry | null> {
    if (!this.uploaded.has(path)) return null;
    return {
      id: path,
      path,
      name: path.split("/").at(-1) ?? "",
      mimeType: "text/plain",
      size: this.uploaded.get(path)?.byteLength ?? 0,
      modifiedAt: null,
      contentHash: null,
    };
  }

  async createFolder(path: string): Promise<void> {
    this.created.push(path);
  }

  async upload(path: string, bytes: Uint8Array): Promise<void> {
    this.uploaded.set(path, bytes);
  }

  async move(): Promise<void> {}
  async copy(): Promise<void> {}
  async archive(): Promise<void> {}
}

describe("Media Projects storage", () => {
  it("writes editor artifacts inside Projects and verifies every upload", async () => {
    const provider = new MemoryProvider();
    const result = await writeEditorBundleToProjects({
      provider,
      rootPath: "/Apps/Kostya Media Brain",
      projectId: "project 1",
      candidateId: "candidate 1",
      files: [
        {
          relativePath: "edit-plan.json",
          mimeType: "application/json",
          content: "{}",
        },
        {
          relativePath: "captions.srt",
          mimeType: "application/x-subrip",
          content: "1\n00:00:00,000 --> 00:00:01,000\nТекст",
        },
      ],
    });

    expect(result.projectPath).toBe("/Apps/Kostya Media Brain/Projects/project_1");
    expect(result.candidatePath).toBe(
      "/Apps/Kostya Media Brain/Projects/project_1/candidate_1",
    );
    expect(provider.created).toEqual([
      "/Apps/Kostya Media Brain/Projects/project_1",
      "/Apps/Kostya Media Brain/Projects/project_1/candidate_1",
    ]);
    expect(result.filePaths).toHaveLength(2);
    expect(provider.uploaded.size).toBe(2);
  });

  it("fails closed when Observer-style stat verification cannot see an upload", async () => {
    const provider = new MemoryProvider();
    provider.stat = async () => null;

    await expect(
      writeEditorBundleToProjects({
        provider,
        rootPath: "/Media",
        projectId: "project-1",
        candidateId: "candidate-1",
        files: [
          {
            relativePath: "brief.txt",
            mimeType: "text/plain",
            content: "test",
          },
        ],
      }),
    ).rejects.toThrow("upload verification failed");
  });
});
