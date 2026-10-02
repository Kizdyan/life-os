import { describe, expect, it } from "vitest";
import { YandexDiskProvider } from "./yandex-disk-provider";

describe("YandexDiskProvider", () => {
  it("lists assets and preserves provider metadata", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push(String(input));
      expect(init?.headers).toMatchObject({ Authorization: "OAuth test-token" });
      return new Response(
        JSON.stringify({
          _embedded: {
            items: [
              {
                resource_id: "res-1",
                path: "disk:/Apps/Kostya Media Brain/Inbox/clip.mov",
                name: "clip.mov",
                type: "file",
                mime_type: "video/quicktime",
                size: 123,
                modified: "2026-09-28T20:00:00+00:00",
                sha256: "abc",
              },
            ],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const provider = new YandexDiskProvider({ oauthToken: "test-token", fetchImpl });
    const items = await provider.list("/Apps/Kostya Media Brain/Inbox");

    expect(items).toEqual([
      {
        id: "res-1",
        path: "/Apps/Kostya Media Brain/Inbox/clip.mov",
        name: "clip.mov",
        mimeType: "video/quicktime",
        size: 123,
        modifiedAt: "2026-09-28T20:00:00+00:00",
        contentHash: "abc",
      },
    ]);
    expect(calls[0]).toContain("cloud-api.yandex.net");
  });

  it("uploads only after receiving a provider upload URL", async () => {
    const methods: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      methods.push(`${init?.method ?? "GET"} ${String(input)}`);
      if (String(input).includes("/resources/upload")) {
        return new Response(JSON.stringify({ href: "https://upload.example.test/token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      expect(String(input)).toBe("https://upload.example.test/token");
      expect(init?.method).toBe("PUT");
      return new Response(null, { status: 201 });
    };

    const provider = new YandexDiskProvider({ oauthToken: "test-token", fetchImpl });
    await provider.upload(
      "/Apps/Kostya Media Brain/Inbox/clip.mp4",
      new Uint8Array([1, 2, 3]),
      "video/mp4",
    );

    expect(methods).toHaveLength(2);
    expect(methods[0]).toContain("GET");
    expect(methods[1]).toContain("PUT https://upload.example.test/token");
  });

  it("keeps archive non-destructive in v1", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method });

      if (url.includes("/resources/copy")) {
        return new Response(JSON.stringify({ href: "operation" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/v1/disk/resources")) {
        return new Response(
          JSON.stringify({
            resource_id: "archive-copy",
            path: "disk:/Apps/Kostya Media Brain/Projects/Archive/clip.mov",
            name: "clip.mov",
            type: "file",
            mime_type: "video/quicktime",
            size: 10,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(null, { status: 500 });
    };

    const provider = new YandexDiskProvider({ oauthToken: "test-token", fetchImpl });
    await provider.archive(
      "/Apps/Kostya Media Brain/Inbox/clip.mov",
      "/Apps/Kostya Media Brain/Projects/Archive/clip.mov",
    );

    expect(calls.some((call) => call.url.includes("/resources/copy"))).toBe(true);
    expect(calls.some((call) => call.method === "DELETE")).toBe(false);
  });
});
