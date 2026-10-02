import { describe, expect, it } from "vitest";
import { YandexDiskKeyValueStore } from "./yandex-kv-store";

describe("YandexDiskKeyValueStore", () => {
  it("returns null when the hidden state file does not exist", async () => {
    const fetchImpl: typeof fetch = async (input, init) => {
      expect(String(input)).toContain("/resources/download");
      expect(init?.headers).toMatchObject({ Authorization: "OAuth test-token" });
      return new Response(JSON.stringify({ error: "DiskNotFoundError" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    };

    const store = new YandexDiskKeyValueStore({
      oauthToken: "test-token",
      rootPath: "/Apps/Kostya Media Brain",
      fetchImpl,
    });

    await expect(store.get("lifeos:media-brain:v1")).resolves.toBeNull();
  });

  it("reads values from one versioned hidden state file", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.includes("/resources/download")) {
        expect(init?.headers).toMatchObject({ Authorization: "OAuth test-token" });
        return new Response(JSON.stringify({ href: "https://download.example.test/state" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      expect(url).toBe("https://download.example.test/state");
      expect(init?.headers).toBeUndefined();
      return new Response(
        JSON.stringify({
          schemaVersion: 1,
          values: {
            "lifeos:media-brain:v1": "serialized-state",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const store = new YandexDiskKeyValueStore({
      oauthToken: "test-token",
      rootPath: "/Apps/Kostya Media Brain",
      fetchImpl,
    });

    await expect(store.get("lifeos:media-brain:v1")).resolves.toBe("serialized-state");
    expect(calls).toHaveLength(2);
  });

  it("merges a value and overwrites the single hidden state file", async () => {
    let uploaded = "";
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("/resources/download")) {
        return new Response(JSON.stringify({ href: "https://download.example.test/state" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === "https://download.example.test/state") {
        return new Response(
          JSON.stringify({ schemaVersion: 1, values: { existing: "keep-me" } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/resources/upload")) {
        const parsed = new URL(url);
        expect(parsed.searchParams.get("path")).toBe(
          "/Apps/Kostya Media Brain/.lifeos-state-v1.json",
        );
        expect(parsed.searchParams.get("overwrite")).toBe("true");
        expect(init?.headers).toMatchObject({ Authorization: "OAuth test-token" });
        return new Response(JSON.stringify({ href: "https://upload.example.test/state" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === "https://upload.example.test/state") {
        const body = init?.body;
        if (typeof body === "string") uploaded = body;
        else if (body instanceof Uint8Array) uploaded = new TextDecoder().decode(body);
        else if (body instanceof ArrayBuffer) uploaded = new TextDecoder().decode(new Uint8Array(body));
        expect(init?.method).toBe("PUT");
        return new Response(null, { status: 201 });
      }
      throw new Error(`Unexpected request: ${url}`);
    };

    const store = new YandexDiskKeyValueStore({
      oauthToken: "test-token",
      rootPath: "/Apps/Kostya Media Brain",
      fetchImpl,
    });

    await store.set("lifeos:media-brain:v1", "new-state");

    expect(JSON.parse(uploaded)).toEqual({
      schemaVersion: 1,
      values: {
        existing: "keep-me",
        "lifeos:media-brain:v1": "new-state",
      },
    });
  });

  it("fails closed on unsupported or malformed state instead of silently resetting it", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/resources/download")) {
        return new Response(JSON.stringify({ href: "https://download.example.test/state" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ schemaVersion: 99, values: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const store = new YandexDiskKeyValueStore({
      oauthToken: "test-token",
      rootPath: "/Apps/Kostya Media Brain",
      fetchImpl,
    });

    await expect(store.get("anything")).rejects.toThrow("state schema");
  });
});
