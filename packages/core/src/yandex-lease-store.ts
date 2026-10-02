import type { MediaLeaseStore } from "./media-runtime";
import {
  normalizeDiskPath,
  yandexAuthHeaders,
  yandexDownloadLinkUrl,
  yandexResourceUrl,
  yandexUploadLinkUrl,
} from "./yandex-disk";

interface LeaseRecord {
  schemaVersion: 1;
  ownerId: string;
  expiresAt: string;
  updatedAt: string;
}

interface YandexLinkResponse {
  href?: string;
}

export interface YandexDiskLeaseStoreOptions {
  oauthToken: string;
  rootPath: string;
  fetchImpl?: typeof fetch;
  verifyAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
}

export class YandexDiskLeaseStore implements MediaLeaseStore {
  private readonly token: string;
  private readonly rootPath: string;
  private readonly fetchImpl: typeof fetch;
  private readonly verifyAttempts: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: YandexDiskLeaseStoreOptions) {
    this.token = options.oauthToken.trim();
    if (!this.token) throw new Error("Yandex.Disk OAuth token is required");
    this.rootPath = normalizeDiskPath(options.rootPath);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.verifyAttempts = Math.max(1, Math.floor(options.verifyAttempts ?? 3));
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async acquire(key: string, ownerId: string, ttlMs: number, now: string): Promise<boolean> {
    const identity = validateIdentity(key, ownerId);
    const nowMs = parseTime(now, "lease now");
    const path = this.lockPath(identity.key);
    const response = await this.fetchImpl(yandexResourceUrl(path), {
      method: "PUT",
      headers: yandexAuthHeaders(this.token),
    });

    if (response.status === 409) {
      // Yandex.Disk can atomically reject an existing directory, but does not
      // expose a compare-and-swap delete. Never steal/reclaim here: an unsafe
      // takeover could let an old worker delete a newer worker's lock.
      return false;
    }
    if (!response.ok) {
      throw new Error(`Yandex.Disk lease create failed: ${response.status} ${response.statusText}`);
    }

    const record = leaseRecord(identity.ownerId, now, nowMs + normalizeTtl(ttlMs));
    try {
      await this.writeLease(path, record);
      return true;
    } catch (error) {
      // We created this directory and no second owner can acquire it until it
      // is removed, so cleanup is safe before propagating the failure.
      await this.deleteLock(path).catch(() => undefined);
      throw error;
    }
  }

  async renew(key: string, ownerId: string, ttlMs: number, now: string): Promise<boolean> {
    const identity = validateIdentity(key, ownerId);
    const nowMs = parseTime(now, "lease now");
    const path = this.lockPath(identity.key);
    const current = await this.readLease(path);
    if (!current || current.ownerId !== identity.ownerId) return false;
    if (parseTime(current.expiresAt, "lease expiry") <= nowMs) return false;

    const next = leaseRecord(identity.ownerId, now, nowMs + normalizeTtl(ttlMs));
    await this.writeLease(path, next);
    return true;
  }

  async release(key: string, ownerId: string): Promise<void> {
    const identity = validateIdentity(key, ownerId);
    const path = this.lockPath(identity.key);
    const current = await this.readLease(path);
    if (!current || current.ownerId !== identity.ownerId) return;

    // No automatic stale takeover exists, therefore while this directory is
    // present no other owner can have acquired the same lease. Deleting after
    // owner verification cannot remove a newer owner's lease.
    await this.deleteLock(path);
  }

  private lockPath(key: string): string {
    const slug = key
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "lease";
    const name = `.lifeos-lock-${slug}-${fnv1a(key).toString(16).padStart(8, "0")}`;
    return this.rootPath === "/" ? `/${name}` : `${this.rootPath}/${name}`;
  }

  private ownerPath(lockPath: string): string {
    return `${lockPath}/owner.json`;
  }

  private async readLease(lockPath: string): Promise<LeaseRecord | null> {
    const response = await this.fetchImpl(yandexDownloadLinkUrl(this.ownerPath(lockPath)), {
      method: "GET",
      headers: yandexAuthHeaders(this.token),
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Yandex.Disk lease download-link failed: ${response.status} ${response.statusText}`);
    }
    const link = (await response.json()) as YandexLinkResponse;
    if (!link.href) throw new Error("Yandex.Disk did not return a lease download URL");
    const download = await this.fetchImpl(link.href, { method: "GET" });
    if (!download.ok) {
      throw new Error(`Yandex.Disk lease download failed: ${download.status} ${download.statusText}`);
    }
    return validateLease((await download.json()) as unknown);
  }

  private async writeLease(lockPath: string, record: LeaseRecord): Promise<void> {
    const linkResponse = await this.fetchImpl(yandexUploadLinkUrl(this.ownerPath(lockPath), true), {
      method: "GET",
      headers: yandexAuthHeaders(this.token),
    });
    if (!linkResponse.ok) {
      throw new Error(`Yandex.Disk lease upload-link failed: ${linkResponse.status} ${linkResponse.statusText}`);
    }
    const link = (await linkResponse.json()) as YandexLinkResponse;
    if (!link.href) throw new Error("Yandex.Disk did not return a lease upload URL");

    const body = new TextEncoder().encode(JSON.stringify(record));
    const upload = await this.fetchImpl(link.href, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer,
    });
    if (!upload.ok) {
      throw new Error(`Yandex.Disk lease upload failed: ${upload.status} ${upload.statusText}`);
    }

    for (let attempt = 1; attempt <= this.verifyAttempts; attempt += 1) {
      const observed = await this.readLease(lockPath);
      if (
        observed?.ownerId === record.ownerId &&
        observed.expiresAt === record.expiresAt &&
        observed.updatedAt === record.updatedAt
      ) {
        return;
      }
      if (attempt < this.verifyAttempts) await this.sleep(100 * attempt);
    }
    throw new Error("Yandex.Disk lease write verification failed");
  }

  private async deleteLock(lockPath: string): Promise<void> {
    const url = new URL(yandexResourceUrl(lockPath));
    url.searchParams.set("permanently", "true");
    const response = await this.fetchImpl(url.toString(), {
      method: "DELETE",
      headers: yandexAuthHeaders(this.token),
    });
    if (!response.ok && response.status !== 404 && response.status !== 202) {
      throw new Error(`Yandex.Disk lease release failed: ${response.status} ${response.statusText}`);
    }
  }
}

function validateIdentity(key: string, ownerId: string): { key: string; ownerId: string } {
  const normalizedKey = key.trim();
  const normalizedOwner = ownerId.trim();
  if (!normalizedKey) throw new Error("Media lease key is required");
  if (!normalizedOwner) throw new Error("Media lease ownerId is required");
  return { key: normalizedKey, ownerId: normalizedOwner };
}

function normalizeTtl(ttlMs: number): number {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error("Media lease ttlMs must be positive");
  return Math.max(5_000, Math.floor(ttlMs));
}

function parseTime(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${label}`);
  return parsed;
}

function leaseRecord(ownerId: string, updatedAt: string, expiresAtMs: number): LeaseRecord {
  return {
    schemaVersion: 1,
    ownerId,
    updatedAt,
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
}

function validateLease(value: unknown): LeaseRecord {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error("Unsupported or malformed Yandex lease schema");
  }
  const ownerId = typeof value.ownerId === "string" ? value.ownerId.trim() : "";
  const expiresAt = typeof value.expiresAt === "string" ? value.expiresAt : "";
  const updatedAt = typeof value.updatedAt === "string" ? value.updatedAt : "";
  if (!ownerId || !Number.isFinite(Date.parse(expiresAt)) || !Number.isFinite(Date.parse(updatedAt))) {
    throw new Error("Unsupported or malformed Yandex lease schema");
  }
  return { schemaVersion: 1, ownerId, expiresAt, updatedAt };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
