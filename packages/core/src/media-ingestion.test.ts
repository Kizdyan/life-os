import { describe, expect, it } from "vitest";
import type { MediaAsset, MediaStorageProvider } from "./media-brain";
import { ensureMediaBrainFolders, ingestInbox, type MediaAssetStore } from "./media-ingestion";

class MemoryAssetStore implements MediaAssetStore {
  readonly byKey = new Map<string, MediaAsset>();

  async findByIngestKey(key: string): Promise<MediaAsset | null> {
    return this.byKey.get(key) ?? null;
  }

  async save(asset: MediaAsset, ingestKey: string): Promise<void> {
    this.byKey.set(ingestKey, asset);
  }
}

describe("Media Brain ingestion", () => {
  it("creates only the three visible storage folders", async () => {
    const created: string[] = [];
    const provider: MediaStorageProvider = {
      id: "test",
      list: async () => [],
      stat: async () => null,
      createFolder: async (path) => {
        created.push(path);
      },
      upload: async () => undefined,
      move: async () => undefined,
      copy: async () => undefined,
      archive: async () => undefined,
    };

    await ensureMediaBrainFolders(provider, "/Media");
    expect(created).toEqual([
      "/Media",
      "/Media/Inbox",
      "/Media/References",
      "/Media/Projects",
    ]);
  });

  it("ingests Inbox idempotently and never moves the source", async () => {
    let moves = 0;
    const provider: MediaStorageProvider = {
      id: "yandex",
      list: async () => [
        {
          id: "provider-1",
          path: "/Media/Inbox/rehearsal.mov",
          name: "rehearsal.mov",
          mimeType: "video/quicktime",
          size: 100,
          modifiedAt: "2026-09-28T10:00:00.000Z",
          contentHash: "hash-1",
        },
      ],
      stat: async () => null,
      createFolder: async () => undefined,
      upload: async () => undefined,
      move: async () => {
        moves += 1;
      },
      copy: async () => undefined,
      archive: async () => undefined,
    };
    const store = new MemoryAssetStore();
    let id = 0;
    const options = {
      provider,
      assetStore: store,
      rootPath: "/Media",
      now: () => "2026-09-28T11:00:00.000Z",
      createId: () => `asset-${++id}`,
    };

    const first = await ingestInbox(options);
    const second = await ingestInbox(options);

    expect(first.imported).toHaveLength(1);
    expect(second.imported).toHaveLength(0);
    expect(second.existing).toHaveLength(1);
    expect(first.imported[0].provenance).toEqual({
      originalProviderPath: "/Media/Inbox/rehearsal.mov",
      originalProviderId: "provider-1",
      destructiveMoveVerified: false,
    });
    expect(moves).toBe(0);
  });
});
