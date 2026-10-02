import { describe, expect, it } from "vitest";
import { YandexDiskKeyValueStore } from "./yandex-kv-store";

describe("YandexDiskKeyValueStore Observer verification", () => {
  it("re-reads persisted state and fails if Yandex does not expose the written value", async () => {
    let downloadCount = 0;
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("/resources/download")) {
        downloadCount += 1;
        if (downloadCount === 1) {
          return new Response(JSON.stringify({ error: "DiskNotFoundError" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ href: "https://download.example.test/state" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/resources/upload")) {
        return new Response(JSON.stringify({ href: "https://upload.example.test/state" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === "https://upload.example.test/state") {
        expect(init?.method).toBe("PUT");
        return new Response(null, { status: 201 });
      }
      if (url === "https://download.example.test/state") {
        return new Response(
          JSON.stringify({ schemaVersion: 1, values: { "lifeos:media-brain:v1": "wrong-value" } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    };

    const store = new YandexDiskKeyValueStore({
      oauthToken: "test-token",
      rootPath: "/Apps/Kostya Media Brain",
      fetchImpl,
    });

    await expect(
      store.set("lifeos:media-brain:v1", "expected-value"),
    ).rejects.toThrow("verification failed");
  });
});
