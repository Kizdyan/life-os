import type { MediaAsset, MediaAssetStatus, MediaProject } from "./media-brain";

export type MediaProjectViewState =
  | "active"
  | "ready_for_review"
  | "approved"
  | "published"
  | "archived"
  | "rejected";

const TERMINAL_ASSET_STATES = new Set<MediaAssetStatus>([
  "published",
  "archived",
  "rejected",
  "superseded",
]);

export interface MediaProjectProjection {
  projectId: string;
  state: MediaProjectViewState;
  visibleInActiveProjects: boolean;
  assetCount: number;
  terminalAssetCount: number;
}

export function deriveProjectProjection(
  project: MediaProject,
  assets: MediaAsset[],
): MediaProjectProjection {
  const linked = assets.filter((asset) => asset.projectId === project.id);
  const statuses = new Set(linked.map((asset) => asset.status));

  let state: MediaProjectViewState = "active";

  if (project.status === "archived") {
    state = "archived";
  } else if (project.status === "rejected") {
    state = "rejected";
  } else if (linked.length > 0 && linked.every((asset) => asset.status === "published")) {
    state = "published";
  } else if (statuses.has("ready_for_review")) {
    state = "ready_for_review";
  } else if (statuses.has("approved")) {
    state = "approved";
  } else if (project.status === "published") {
    state = "published";
  }

  const terminalAssetCount = linked.filter((asset) =>
    TERMINAL_ASSET_STATES.has(asset.status),
  ).length;

  return {
    projectId: project.id,
    state,
    visibleInActiveProjects: !["published", "archived", "rejected"].includes(state),
    assetCount: linked.length,
    terminalAssetCount,
  };
}

export function activeProjectIds(
  projects: MediaProject[],
  assets: MediaAsset[],
): string[] {
  return projects
    .map((project) => deriveProjectProjection(project, assets))
    .filter((projection) => projection.visibleInActiveProjects)
    .map((projection) => projection.projectId);
}

export function shouldAutoHideProject(
  project: MediaProject,
  assets: MediaAsset[],
): boolean {
  return !deriveProjectProjection(project, assets).visibleInActiveProjects;
}
