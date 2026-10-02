import type { MediaAsset, MediaProject, StyleMemoryObservation } from "./media-brain";
import type { MediaAssetStore } from "./media-ingestion";
import type { MediaJob, MediaJobStore } from "./media-jobs";
import type { MediaProjectStore } from "./media-projects";
import type { StyleMemoryStore } from "./style-memory";
import type {
  AudiencePerformanceSignal,
  AudiencePerformanceStore,
} from "./media-analytics";

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export interface MediaStateSnapshot {
  schemaVersion: 1;
  revision: number;
  assetsByIngestKey: Record<string, MediaAsset>;
  jobsById: Record<string, MediaJob>;
  projectsByKey: Record<string, MediaProject>;
  styleObservations: StyleMemoryObservation[];
  audienceSignals: AudiencePerformanceSignal[];
  updatedAt: string;
}

export interface MediaStateStoreOptions {
  kv: KeyValueStore;
  key?: string;
  now: () => string;
}

export class MediaStateStore
  implements
    MediaAssetStore,
    MediaJobStore,
    MediaProjectStore,
    StyleMemoryStore,
    AudiencePerformanceStore
{
  private readonly key: string;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly options: MediaStateStoreOptions) {
    this.key = options.key ?? "lifeos:media-brain:v1";
  }

  async findByIngestKey(key: string): Promise<MediaAsset | null> {
    const state = await this.read();
    return state.assetsByIngestKey[key] ?? null;
  }

  async save(asset: MediaAsset, ingestKey: string): Promise<void>;
  async save(job: MediaJob): Promise<void>;
  async save(project: MediaProject, key: string): Promise<void>;
  async save(
    value: MediaAsset | MediaJob | MediaProject,
    key?: string,
  ): Promise<void> {
    if (isMediaJob(value)) {
      await this.update((state) => {
        state.jobsById[value.id] = clone(value);
      });
      return;
    }

    if (isMediaProject(value)) {
      if (!key) throw new Error("Project store key is required");
      await this.update((state) => {
        state.projectsByKey[key] = clone(value);
      });
      return;
    }

    if (!key) throw new Error("Asset ingest key is required");
    await this.update((state) => {
      state.assetsByIngestKey[key] = clone(value);
    });
  }

  async enqueue(job: MediaJob): Promise<void> {
    await this.update((state) => {
      if (state.jobsById[job.id]) {
        throw new Error(`Media job already exists: ${job.id}`);
      }
      state.jobsById[job.id] = clone(job);
    });
  }

  async get(jobId: string): Promise<MediaJob | null> {
    const state = await this.read();
    return state.jobsById[jobId] ?? null;
  }

  async listRunnable(now: string, limit: number): Promise<MediaJob[]> {
    const state = await this.read();
    return Object.values(state.jobsById)
      .filter((job) => job.state === "queued" || job.state === "failed")
      .filter((job) => !job.notBefore || job.notBefore <= now)
      .sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, Math.max(0, limit));
  }

  async findActiveByKey(key: string): Promise<MediaProject | null> {
    const state = await this.read();
    const project = state.projectsByKey[key];
    if (!project) return null;
    if (["archived", "published", "rejected"].includes(project.status)) {
      return null;
    }
    return project;
  }

  async append(observation: StyleMemoryObservation): Promise<void>;
  async append(signal: AudiencePerformanceSignal): Promise<void>;
  async append(
    value: StyleMemoryObservation | AudiencePerformanceSignal,
  ): Promise<void> {
    if (isAudiencePerformanceSignal(value)) {
      await this.update((state) => {
        state.audienceSignals.push(clone(value));
      });
      return;
    }

    await this.update((state) => {
      state.styleObservations.push(clone(value));
    });
  }

  async listByDimension(
    dimension: StyleMemoryObservation["dimension"],
  ): Promise<StyleMemoryObservation[]> {
    const state = await this.read();
    return state.styleObservations
      .filter((item) => item.dimension === dimension)
      .map(clone);
  }

  async listByCandidate(
    candidateId: string,
  ): Promise<AudiencePerformanceSignal[]> {
    const state = await this.read();
    return state.audienceSignals
      .filter((signal) => signal.candidateId === candidateId)
      .map(clone);
  }

  async snapshot(): Promise<MediaStateSnapshot> {
    return this.read();
  }

  private async read(): Promise<MediaStateSnapshot> {
    const raw = await this.options.kv.get(this.key);
    if (!raw) return emptyState(this.options.now());

    const parsed = JSON.parse(raw) as Partial<MediaStateSnapshot>;
    if (parsed.schemaVersion !== 1) {
      throw new Error("Unsupported Media Brain state schema");
    }

    return {
      schemaVersion: 1,
      revision: finiteInteger(parsed.revision, 0),
      assetsByIngestKey: parsed.assetsByIngestKey ?? {},
      jobsById: parsed.jobsById ?? {},
      projectsByKey: parsed.projectsByKey ?? {},
      styleObservations: parsed.styleObservations ?? [],
      audienceSignals: parsed.audienceSignals ?? [],
      updatedAt:
        typeof parsed.updatedAt === "string"
          ? parsed.updatedAt
          : this.options.now(),
    };
  }

  private async update(
    mutate: (state: MediaStateSnapshot) => void,
  ): Promise<void> {
    const operation = this.queue
      .catch(() => undefined)
      .then(async () => {
        const state = await this.read();
        mutate(state);
        state.revision += 1;
        state.updatedAt = this.options.now();
        await this.options.kv.set(this.key, JSON.stringify(state));
      });

    // Keep the internal serialization chain healthy after a caller-visible
    // failure, while still propagating this operation's error to its caller.
    this.queue = operation.catch(() => undefined);
    await operation;
  }
}

function emptyState(now: string): MediaStateSnapshot {
  return {
    schemaVersion: 1,
    revision: 0,
    assetsByIngestKey: {},
    jobsById: {},
    projectsByKey: {},
    styleObservations: [],
    audienceSignals: [],
    updatedAt: now,
  };
}

function isMediaJob(
  value: MediaAsset | MediaJob | MediaProject,
): value is MediaJob {
  return (
    "type" in value &&
    "maxAttempts" in value &&
    "dependsOnJobId" in value
  );
}

function isMediaProject(
  value: MediaAsset | MediaJob | MediaProject,
): value is MediaProject {
  return "assetIds" in value && "channelTargets" in value;
}

function isAudiencePerformanceSignal(
  value: StyleMemoryObservation | AudiencePerformanceSignal,
): value is AudiencePerformanceSignal {
  return "rates" in value && "raw" in value;
}

function finiteInteger(value: unknown, fallback: number): number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value)
    ? value
    : fallback;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
