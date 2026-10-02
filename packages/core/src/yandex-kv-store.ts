import type { KeyValueStore } from "./media-state-store";
import {
  normalizeDiskPath,
  yandexAuthHeaders,
  yandexDownloadLinkUrl,
  yandexUploadLinkUrl,
} from "./yandex-disk";

interface StateEnvelope {
  schemaVersion: 1;
  values: Record<string, string>;
}

interface YandexLinkResponse {
  href?: string;
}

export interface YandexDiskKeyValueStoreOptions {
  oauthToken: string;
  rootPath: string;
  stateFileName?: string;
  fetchImpl?: typeof fetch;
  verifyAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
}

export class YandexDiskKeyValueStore implements KeyValueStore {
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly statePath: string;
  private readonly verifyAttempts: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: YandexDiskKeyValueStoreOptions) {
    this.token = options.oauthToken.trim();
    if (!this.token) throw new Error("Yandex.Disk OAuth token is required");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.verifyAttempts = Math.max(1, Math.floor(options.verifyAttempts ?? 3));
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    const root = normalizeDiskPath(options.rootPath);
    const fileName = (options.stateFileName ?? ".lifeos-state-v1.json").trim();
    if (!fileName || fileName.includes("/") || fileName.includes("\\")) {
      throw new Error("Yandex state file name must be a single file name");
    }
    this.statePath = root === "/" ? `/${fileName}` : `${root}/${fileName}`;
  }

  async get(key: string): Promise<string | null> {
    if (!key) throw new Error("Media state key is required");
    const envelope = await this.readEnvelope();
    return envelope?.values[key] ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    if (!key) throw new Error("Media state key is required");
    const envelope = (await this.readEnvelope()) ?? emptyEnvelope();
    envelope.values[key] = value;
    await this.writeEnvelope(envelope);

    for (let attempt = 1; attempt <= this.verifyAttempts; attempt += 1) {
      const observed = await this.readEnvelope();
      if (observed?.values[key] === value) return;
      if (attempt < this.verifyAttempts) await this.sleep(100 * attempt);
    }
    throw new Error("Yandex.Disk state write verification failed");
  }

  private async readEnvelope(): Promise<StateEnvelope | null> {
    const response = await this.fetchImpl(yandexDownloadLinkUrl(this.statePath), {
      method: "GET",
      headers: yandexAuthHeaders(this.token),
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(
        `Yandex.Disk state download-link request failed: ${response.status} ${response.statusText}`,
      );
    }

    const link = (await response.json()) as YandexLinkResponse;
    if (!link.href) throw new Error("Yandex.Disk did not return a state download URL");
    const download = await this.fetchImpl(link.href, { method: "GET" });
    if (!download.ok) {
      throw new Error(
        `Yandex.Disk state download failed: ${download.status} ${download.statusText}`,
      );
    }

    const raw = (await download.json()) as unknown;
    return validateEnvelope(raw);
  }

  private async writeEnvelope(envelope: StateEnvelope): Promise<void> {
    const linkResponse = await this.fetchImpl(yandexUploadLinkUrl(this.statePath, true), {
      method: "GET",
      headers: yandexAuthHeaders(this.token),
    });
    if (!linkResponse.ok) {
      throw new Error(
        `Yandex.Disk state upload-link request failed: ${linkResponse.status} ${linkResponse.statusText}`,
      );
    }
    const link = (await linkResponse.json()) as YandexLinkResponse;
    if (!link.href) throw new Error("Yandex.Disk did not return a state upload URL");

    const body = new TextEncoder().encode(JSON.stringify(envelope));
    const upload = await this.fetchImpl(link.href, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer,
    });
    if (!upload.ok) {
      throw new Error(
        `Yandex.Disk state upload failed: ${upload.status} ${upload.statusText}`,
      );
    }
  }
}

function emptyEnvelope(): StateEnvelope {
  return { schemaVersion: 1, values: {} };
}

function validateEnvelope(value: unknown): StateEnvelope {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.values)) {
    throw new Error("Unsupported or malformed Yandex state schema");
  }
  const values: Record<string, string> = {};
  for (const [key, item] of Object.entries(value.values)) {
    if (typeof item !== "string") {
      throw new Error("Unsupported or malformed Yandex state schema");
    }
    values[key] = item;
  }
  return { schemaVersion: 1, values };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
