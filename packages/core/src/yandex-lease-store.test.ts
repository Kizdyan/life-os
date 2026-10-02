import { describe, expect, it } from "vitest";
import { YandexDiskLeaseStore } from "./yandex-lease-store";

type Lease = { schemaVersion: 1; ownerId: string; expiresAt: string; updatedAt: string };

class FakeYandexLeaseApi {
  folderExists = false;
  lease: Lease | null = null;
  deletes = 0;

  fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";

    if (url.hostname === "cloud-api.yandex.net" && url.pathname.endsWith("/resources/download")) {
      if (!this.lease) {
        return new Response(JSON.stringify({ error: "DiskNotFoundError" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ href: "https://download.example.test/lease" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.hostname === "download.example.test") {
      return new Response(JSON.stringify(this.lease), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.hostname === "cloud-api.yandex.net" && url.pathname.endsWith("/resources/upload")) {
      return new Response(JSON.stringify({ href: "https://upload.example.test/lease" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.hostname === "upload.example.test") {
      const body = init?.body;
      let text = "";
      if (typeof body === "string") text = body;
      else if (body instanceof Uint8Array) text = new TextDecoder().decode(body);
      else if (body instanceof ArrayBuffer) text = new TextDecoder().decode(new Uint8Array(body));
      this.lease = JSON.parse(text) as Lease;
      return new Response(null, { status: 201 });
    }

    if (url.hostname === "cloud-api.yandex.net" && url.pathname.endsWith("/resources")) {
      if (method === "PUT") {
        if (this.folderExists) {
          return new Response(JSON.stringify({ error: "DiskPathPointsToExistentDirectoryError" }), {
            status: 409,
            headers: { "Content-Type": "application/json" },
          });
        }
        this.folderExists = true;
        return new Response(null, { status: 201 });
      }
      if (method === "DELETE") {
        this.deletes += 1;
        this.folderExists = false;
        this.lease = null;
        return new Response(null, { status: 204 });
      }
      if (method === "GET") {
        if (!this.folderExists) {
          return new Response(JSON.stringify({ error: "DiskNotFoundError" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ type: "dir" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    throw new Error(`Unexpected Yandex lease request: ${method} ${url.toString()}`);
  };
}

const now = "2026-10-02T12:00:00.000Z";

function store(api: FakeYandexLeaseApi) {
  return new YandexDiskLeaseStore({
    oauthToken: "test-token",
    rootPath: "/Apps/Kostya Media Brain",
    fetchImpl: api.fetch,
    verifyAttempts: 1,
    sleep: async () => undefined,
  });
}

describe("YandexDiskLeaseStore", () => {
  it("atomically acquires a free lease and records the owner", async () => {
    const api = new FakeYandexLeaseApi();
    const acquired = await store(api).acquire("media-brain:poller", "worker-a", 120_000, now);

    expect(acquired).toBe(true);
    expect(api.folderExists).toBe(true);
    expect(api.lease?.ownerId).toBe("worker-a");
    expect(api.lease?.expiresAt).toBe("2026-10-02T12:02:00.000Z");
  });

  it("does not steal an active lease from another worker", async () => {
    const api = new FakeYandexLeaseApi();
    api.folderExists = true;
    api.lease = {
      schemaVersion: 1,
      ownerId: "worker-a",
      updatedAt: now,
      expiresAt: "2026-10-02T12:02:00.000Z",
    };

    await expect(store(api).acquire("media-brain:poller", "worker-b", 120_000, now)).resolves.toBe(false);
    expect(api.deletes).toBe(0);
    expect(api.lease.ownerId).toBe("worker-a");
  });

  it("fails safe on an expired orphan instead of racing a destructive takeover", async () => {
    const api = new FakeYandexLeaseApi();
    api.folderExists = true;
    api.lease = {
      schemaVersion: 1,
      ownerId: "dead-worker",
      updatedAt: "2026-10-02T11:55:00.000Z",
      expiresAt: "2026-10-02T11:56:00.000Z",
    };

    await expect(store(api).acquire("media-brain:poller", "worker-b", 120_000, now)).resolves.toBe(false);
    expect(api.deletes).toBe(0);
    expect(api.lease.ownerId).toBe("dead-worker");
  });

  it("renews only a live lease owned by the caller", async () => {
    const api = new FakeYandexLeaseApi();
    api.folderExists = true;
    api.lease = {
      schemaVersion: 1,
      ownerId: "worker-a",
      updatedAt: now,
      expiresAt: "2026-10-02T12:02:00.000Z",
    };

    await expect(store(api).renew("media-brain:poller", "worker-b", 120_000, now)).resolves.toBe(false);
    await expect(store(api).renew("media-brain:poller", "worker-a", 180_000, now)).resolves.toBe(true);
    expect(api.lease?.expiresAt).toBe("2026-10-02T12:03:00.000Z");
  });

  it("does not resurrect an already expired lease during heartbeat", async () => {
    const api = new FakeYandexLeaseApi();
    api.folderExists = true;
    api.lease = {
      schemaVersion: 1,
      ownerId: "worker-a",
      updatedAt: "2026-10-02T11:55:00.000Z",
      expiresAt: "2026-10-02T11:59:00.000Z",
    };

    await expect(store(api).renew("media-brain:poller", "worker-a", 120_000, now)).resolves.toBe(false);
    expect(api.lease.expiresAt).toBe("2026-10-02T11:59:00.000Z");
  });

  it("releases only the caller's own lease", async () => {
    const api = new FakeYandexLeaseApi();
    api.folderExists = true;
    api.lease = {
      schemaVersion: 1,
      ownerId: "worker-a",
      updatedAt: now,
      expiresAt: "2026-10-02T12:02:00.000Z",
    };

    await store(api).release("media-brain:poller", "worker-b");
    expect(api.folderExists).toBe(true);
    expect(api.deletes).toBe(0);

    await store(api).release("media-brain:poller", "worker-a");
    expect(api.folderExists).toBe(false);
    expect(api.deletes).toBe(1);
  });
});
