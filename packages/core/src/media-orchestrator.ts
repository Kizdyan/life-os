import type { MediaCapabilities, MediaStorageProvider } from "./media-brain";
import {
  ensureMediaBrainFolders,
  ingestInbox,
  ingestReferences,
  type MediaAssetStore,
} from "./media-ingestion";
import {
  createDownstreamJobs,
  createReferenceJobs,
  type MediaJob,
  type MediaJobStore,
} from "./media-jobs";

export interface MediaBrainOrchestratorOptions {
  provider: MediaStorageProvider;
  assetStore: MediaAssetStore;
  jobStore: MediaJobStore;
  capabilities: MediaCapabilities;
  rootPath: string;
  now: () => string;
  createAssetId: () => string;
  createJobId: () => string;
}

export interface MediaBrainTickResult {
  importedAssetIds: string[];
  importedReferenceIds: string[];
  existingAssetIds: string[];
  existingReferenceIds: string[];
  enqueuedJobIds: string[];
}

export class MediaBrainOrchestrator {
  constructor(private readonly options: MediaBrainOrchestratorOptions) {}

  async bootstrap(): Promise<void> {
    await ensureMediaBrainFolders(this.options.provider, this.options.rootPath);
  }

  async tick(): Promise<MediaBrainTickResult> {
    const now = this.options.now();

    // Keep ingestion sequential: asset-store check+save is intentionally simple in
    // core and must not race across sections before a transactional store exists.
    const inbox = await ingestInbox({
      provider: this.options.provider,
      assetStore: this.options.assetStore,
      rootPath: this.options.rootPath,
      now: () => now,
      createId: this.options.createAssetId,
    });
    const references = await ingestReferences({
      provider: this.options.provider,
      assetStore: this.options.assetStore,
      rootPath: this.options.rootPath,
      now: () => now,
      createId: this.options.createAssetId,
    });

    const jobs: MediaJob[] = [];
    for (const asset of inbox.imported) {
      jobs.push(
        ...createDownstreamJobs({
          asset,
          capabilities: this.options.capabilities,
          now,
          createId: this.options.createJobId,
        }),
      );
    }
    for (const asset of references.imported) {
      jobs.push(
        ...createReferenceJobs({
          asset,
          now,
          createId: this.options.createJobId,
        }),
      );
    }

    for (const job of jobs) {
      await this.options.jobStore.enqueue(job);
    }

    return {
      importedAssetIds: inbox.imported.map((asset) => asset.id),
      importedReferenceIds: references.imported.map((asset) => asset.id),
      existingAssetIds: inbox.existing.map((asset) => asset.id),
      existingReferenceIds: references.existing.map((asset) => asset.id),
      enqueuedJobIds: jobs.map((job) => job.id),
    };
  }
}
