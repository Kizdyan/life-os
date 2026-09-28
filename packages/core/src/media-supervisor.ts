import type { MediaBrainOrchestrator, MediaBrainTickResult } from "./media-orchestrator";
import type { MediaJob, MediaWorker } from "./media-jobs";

export interface MediaSupervisorRun {
  ingestion: MediaBrainTickResult;
  passes: number;
  processed: MediaJob[];
  stoppedBecause: "idle" | "max_passes";
}

export interface MediaSupervisorOptions {
  orchestrator: MediaBrainOrchestrator;
  worker: MediaWorker;
  maxPasses?: number;
}

export class MediaSupervisor {
  private readonly maxPasses: number;

  constructor(private readonly options: MediaSupervisorOptions) {
    this.maxPasses = Math.max(1, options.maxPasses ?? 12);
  }

  async bootstrap(): Promise<void> {
    await this.options.orchestrator.bootstrap();
  }

  async runCycle(): Promise<MediaSupervisorRun> {
    const ingestion = await this.options.orchestrator.tick();
    const processed: MediaJob[] = [];

    for (let pass = 1; pass <= this.maxPasses; pass += 1) {
      const result = await this.options.worker.runOnce();
      processed.push(...result);

      if (result.length === 0) {
        return {
          ingestion,
          passes: pass,
          processed,
          stoppedBecause: "idle",
        };
      }
    }

    return {
      ingestion,
      passes: this.maxPasses,
      processed,
      stoppedBecause: "max_passes",
    };
  }
}
