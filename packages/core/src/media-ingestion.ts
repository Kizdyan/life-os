import type {
  MediaAsset,
  MediaAssetSource,
  MediaStorageEntry,
  MediaStorageProvider,
} from "./media-brain";
import { mediaAssetKey, mediaSectionPath } from "./media-brain";

export interface MediaAssetStore {
  findByIngestKey(key: string): Promise<MediaAsset | null>;
  save(asset: MediaAsset, ingestKey: string): Promise<void>;
}

export interface IngestOptions {
  provider: MediaStorageProvider;
  assetStore: MediaAssetStore;
  rootPath: string;
  now: () => string;
  createId: () => string;
  classifySource?: (entry: MediaStorageEntry) => MediaAssetSource;
}

export interface IngestResult {
  imported: MediaAsset[];
  existing: MediaAsset[];
}

export async function ensureMediaBrainFolders(
  provider: MediaStorageProvider,
  rootPath: string,
): Promise<void> {
  await provider.createFolder(rootPath);
  for (const section of ["inbox", "references", "projects"] as const) {
    await provider.createFolder(mediaSectionPath(rootPath, section));
  }
}

export async function ingestInbox(options: IngestOptions): Promise<IngestResult> {
  const inboxPath = mediaSectionPath(options.rootPath, "inbox");
  const entries = await options.provider.list(inboxPath);
  const imported: MediaAsset[] = [];
  const existing: MediaAsset[] = [];

  for (const entry of entries) {
    if (entry.mimeType === "application/vnd.yandex.disk.folder") continue;

    const ingestKey = mediaAssetKey(options.provider.id, entry.path, entry.contentHash);
    const known = await options.assetStore.findByIngestKey(ingestKey);
    if (known) {
      existing.push(known);
      continue;
    }

    const asset: MediaAsset = {
      id: options.createId(),
      provider: options.provider.id,
      providerId: entry.id,
      providerPath: entry.path,
      contentHash: entry.contentHash,
      mimeType: entry.mimeType,
      source: options.classifySource?.(entry) ?? "own_raw",
      section: "inbox",
      status: "ingested",
      projectId: null,
      createdAt: entry.modifiedAt,
      importedAt: options.now(),
      provenance: {
        originalProviderPath: entry.path,
        originalProviderId: entry.id,
        destructiveMoveVerified: false,
      },
    };

    await options.assetStore.save(asset, ingestKey);
    imported.push(asset);
  }

  return { imported, existing };
}
