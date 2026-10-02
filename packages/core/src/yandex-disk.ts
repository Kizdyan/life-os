import type { MediaSection } from "./media-brain";

export interface YandexDiskConfig {
  rootPath: string;
  oauthTokenEnv: string;
}

export const DEFAULT_YANDEX_DISK_CONFIG: YandexDiskConfig = {
  rootPath: "/Apps/Kostya Media Brain",
  oauthTokenEnv: "YANDEX_DISK_OAUTH_TOKEN",
};

export function normalizeDiskPath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/{2,}/g, "/").trim();
  if (!normalized || normalized === "/") return "/";
  return "/" + normalized.replace(/^\/+|\/+$/g, "");
}

export function yandexSectionPath(rootPath: string, section: MediaSection): string {
  const folder: Record<MediaSection, string> = {
    inbox: "Inbox",
    references: "References",
    projects: "Projects",
  };
  const root = normalizeDiskPath(rootPath);
  return root === "/" ? `/${folder[section]}` : `${root}/${folder[section]}`;
}

export function yandexResourceUrl(path: string): string {
  const url = new URL("https://cloud-api.yandex.net/v1/disk/resources");
  url.searchParams.set("path", normalizeDiskPath(path));
  return url.toString();
}

export function yandexUploadLinkUrl(path: string, overwrite = false): string {
  const url = new URL("https://cloud-api.yandex.net/v1/disk/resources/upload");
  url.searchParams.set("path", normalizeDiskPath(path));
  url.searchParams.set("overwrite", String(overwrite));
  return url.toString();
}

export function yandexDownloadLinkUrl(path: string): string {
  const url = new URL("https://cloud-api.yandex.net/v1/disk/resources/download");
  url.searchParams.set("path", normalizeDiskPath(path));
  return url.toString();
}

export function yandexMoveUrl(fromPath: string, toPath: string, overwrite = false): string {
  const url = new URL("https://cloud-api.yandex.net/v1/disk/resources/move");
  url.searchParams.set("from", normalizeDiskPath(fromPath));
  url.searchParams.set("path", normalizeDiskPath(toPath));
  url.searchParams.set("overwrite", String(overwrite));
  return url.toString();
}

export function yandexCopyUrl(fromPath: string, toPath: string, overwrite = false): string {
  const url = new URL("https://cloud-api.yandex.net/v1/disk/resources/copy");
  url.searchParams.set("from", normalizeDiskPath(fromPath));
  url.searchParams.set("path", normalizeDiskPath(toPath));
  url.searchParams.set("overwrite", String(overwrite));
  return url.toString();
}

export function yandexAuthHeaders(oauthToken: string): Record<string, string> {
  if (!oauthToken.trim()) throw new Error("Yandex.Disk OAuth token is required");
  return { Authorization: `OAuth ${oauthToken.trim()}` };
}
