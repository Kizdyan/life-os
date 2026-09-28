import type {
  MediaAsset,
  MediaProject,
  MediaStorageProvider,
} from "./media-brain";
import { mediaSectionPath } from "./media-brain";

export interface MediaProjectStore {
  findActiveByKey(key: string): Promise<MediaProject | null>;
  save(project: MediaProject, key: string): Promise<void>;
}

export interface MediaProjectHint {
  key: string;
  title: string;
  channelTargets: Array<"instagram" | "youtube" | "other">;
}

export async function assignAssetToProject(input: {
  asset: MediaAsset;
  hint: MediaProjectHint;
  store: MediaProjectStore;
  now: string;
  createProjectId: () => string;
}): Promise<{ project: MediaProject; asset: MediaAsset; created: boolean }> {
  const key = input.hint.key.trim();
  if (!key) throw new Error("Project hint key is required");

  let project = await input.store.findActiveByKey(key);
  const created = project === null;

  if (!project) {
    project = {
      id: input.createProjectId(),
      title: input.hint.title.trim() || "Media project",
      status: "in_project",
      assetIds: [],
      channelTargets: [...new Set(input.hint.channelTargets)],
      approvalRequired: true,
      createdAt: input.now,
      updatedAt: input.now,
    };
  }

  if (!project.assetIds.includes(input.asset.id)) {
    project = {
      ...project,
      assetIds: [...project.assetIds, input.asset.id],
      channelTargets: [
        ...new Set([...project.channelTargets, ...input.hint.channelTargets]),
      ],
      updatedAt: input.now,
    };
  }

  await input.store.save(project, key);

  return {
    project,
    asset: {
      ...input.asset,
      projectId: project.id,
      section: "projects",
      status: "in_project",
    },
    created,
  };
}

export async function materializeAssetInProject(input: {
  provider: MediaStorageProvider;
  rootPath: string;
  asset: MediaAsset;
  projectId: string;
  targetName?: string | null;
}): Promise<{ projectPath: string; copiedPath: string }> {
  const projectPath = joinPath(
    mediaSectionPath(input.rootPath, "projects"),
    safeSegment(input.projectId),
  );
  const sourceFolder = joinPath(projectPath, "source");
  await input.provider.createFolder(projectPath);
  await input.provider.createFolder(sourceFolder);

  const sourceName =
    input.targetName?.trim() ||
    input.asset.providerPath.split("/").filter(Boolean).at(-1) ||
    input.asset.id;
  const copiedPath = joinPath(sourceFolder, safeFileName(sourceName));

  await input.provider.copy(input.asset.providerPath, copiedPath);
  const observed = await input.provider.stat(copiedPath);
  if (!observed) {
    throw new Error("Project source copy verification failed");
  }

  return { projectPath, copiedPath };
}

function safeSegment(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Project id must not be empty");
  return trimmed.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "project";
}

function safeFileName(value: string): string {
  const normalized = value
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .at(-1);
  if (!normalized) throw new Error("Project source name must not be empty");
  return normalized.replace(/[<>:"|?*\/]+/g, "_");
}

function joinPath(base: string, child: string): string {
  return `${base.replace(/\/+$/, "")}/${child.replace(/^\/+/, "")}`;
}
