import type {
  MediaStorageEntry,
  MediaStorageProvider,
} from "./media-brain";
import {
  normalizeDiskPath,
  yandexAuthHeaders,
  yandexCopyUrl,
  yandexMoveUrl,
  yandexResourceUrl,
  yandexUploadLinkUrl,
} from "./yandex-disk";

interface YandexEmbeddedItem {
  resource_id?: string;
  path?: string;
  name?: string;
  type?: "file" | "dir";
  mime_type?: string;
  size?: number;
  modified?: string;
  md5?: string;
  sha256?: string;
}

interface YandexResourceResponse extends YandexEmbeddedItem {
  _embedded?: {
    items?: YandexEmbeddedItem[];
  };
}

interface YandexLinkResponse {
  href?: string;
  method?: string;
  templated?: boolean;
}

export interface YandexDiskProviderOptions {
  oauthToken: string;
  fetchImpl?: typeof fetch;
}

export class YandexDiskProvider implements MediaStorageProvider {
  readonly id = "yandex";

  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: YandexDiskProviderOptions) {
    this.token = options.oauthToken.trim();
    if (!this.token) throw new Error("Yandex.Disk OAuth token is required");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async list(path: string): Promise<MediaStorageEntry[]> {
    const url = new URL(yandexResourceUrl(path));
    url.searchParams.set("limit", "1000");
    url.searchParams.set(
      "fields",
      "_embedded.items.resource_id,_embedded.items.path,_embedded.items.name,_embedded.items.type,_embedded.items.mime_type,_embedded.items.size,_embedded.items.modified,_embedded.items.md5,_embedded.items.sha256",
    );
    const data = await this.json<YandexResourceResponse>(url.toString(), { method: "GET" });
    return (data._embedded?.items ?? []).map(mapEntry);
  }

  async stat(path: string): Promise<MediaStorageEntry | null> {
    const url = new URL(yandexResourceUrl(path));
    url.searchParams.set(
      "fields",
      "resource_id,path,name,type,mime_type,size,modified,md5,sha256",
    );
    const response = await this.request(url.toString(), { method: "GET" }, [404]);
    if (response.status === 404) return null;
    return mapEntry((await response.json()) as YandexResourceResponse);
  }

  async createFolder(path: string): Promise<void> {
    const response = await this.request(yandexResourceUrl(path), { method: "PUT" }, [409]);
    if (response.status === 409) {
      const existing = await this.stat(path);
      if (!existing) throw new Error(`Yandex.Disk folder conflict without resource: ${path}`);
    }
  }

  async upload(path: string, bytes: Uint8Array, mimeType?: string | null): Promise<void> {
    const link = await this.json<YandexLinkResponse>(yandexUploadLinkUrl(path, false), {
      method: "GET",
    });
    if (!link.href) throw new Error("Yandex.Disk did not return an upload URL");

    const uploadResponse = await this.fetchImpl(link.href, {
      method: "PUT",
      headers: mimeType ? { "Content-Type": mimeType } : undefined,
      body: Uint8Array.from(bytes).buffer,
    });
    if (!uploadResponse.ok) {
      throw new Error(
        `Yandex.Disk upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`,
      );
    }
  }

  async move(fromPath: string, toPath: string): Promise<void> {
    await this.request(yandexMoveUrl(fromPath, toPath, false), { method: "POST" });
  }

  async copy(fromPath: string, toPath: string): Promise<void> {
    await this.request(yandexCopyUrl(fromPath, toPath, false), { method: "POST" });
  }

  async archive(path: string, archivePath: string): Promise<void> {
    await this.copy(path, archivePath);
    const copied = await this.stat(archivePath);
    if (!copied) {
      throw new Error("Yandex.Disk archive verification failed; source was not changed");
    }
    // Intentionally non-destructive in v1. Source deletion requires a separately
    // approved destructive tool plus Observer verification.
  }

  private async json<T>(url: string, init: RequestInit): Promise<T> {
    const response = await this.request(url, init);
    return (await response.json()) as T;
  }

  private async request(
    url: string,
    init: RequestInit,
    allowedStatuses: number[] = [],
  ): Promise<Response> {
    const response = await this.fetchImpl(url, {
      ...init,
      headers: {
        ...yandexAuthHeaders(this.token),
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok && !allowedStatuses.includes(response.status)) {
      throw new Error(
        `Yandex.Disk request failed: ${response.status} ${response.statusText}`,
      );
    }
    return response;
  }
}

function mapEntry(item: YandexEmbeddedItem): MediaStorageEntry {
  const hash = item.sha256 ?? item.md5 ?? null;
  return {
    id: item.resource_id ?? null,
    path: normalizeDiskPath(item.path?.replace(/^disk:/, "") ?? "/"),
    name: item.name ?? "",
    mimeType: item.type === "dir" ? "application/vnd.yandex.disk.folder" : item.mime_type ?? null,
    size: typeof item.size === "number" ? item.size : null,
    modifiedAt: item.modified ?? null,
    contentHash: hash,
  };
}
