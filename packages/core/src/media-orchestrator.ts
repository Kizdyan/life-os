import type { MediaCapabilities, MediaStorageProvider } from "./media-brain";
import {
  ensureMediaBrainFolders,
  ingestInbox,
  type MediaAssetStore,
} from "./media-ingestion";
import {
  createDownstreamJobs,
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
  existingAssetIds: string[];
  enqueuedJobIds: string[];
}

export class MediaBrainOrchestrator {
  constructor(private readonly options: MediaBrainOrchestratorOptions) {}

  async bootstrap(): Promise<void> {
    await ensureMediaBrainFolders(this.options.provider, this.options.rootPath);
  }

  async tick(): Promise<MediaBrainTickResult> {
    const now = this.options.now();
    const result = await ingestInbox({
      provider: this.options.provider,
      assetStore: this.options.assetStore,
      rootPath: this.options.rootPath,
      now: () => now,
      createId: this.options.createAssetId,
    });

    const jobs: MediaJob[] = [];
    for (const asset of result.imported) {
      jobs.push(
        ...createDownstreamJobs({
          asset,
          capabilities: this.options.capabilities,
          now,
          createId: this.options.createJobId,
        }),
      );
    }

    for (const job of jobs) {
      await this.options.jobStore.enqueue(job);
    }

    return {
      importedAssetIds: result.imported.map((asset) => asset.id),
      existingAssetIds: result.existing.map((asset) => asset.id),
      enqueuedJobIds: jobs.map((job) => job.id),
    };
  }
}
