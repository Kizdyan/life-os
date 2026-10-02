import { describe, expect, it } from "vitest";
import {
  YandexDiskConnectionService,
  type ServerSecretStore,
} from "./yandex-connection";

class MemorySecrets implements ServerSecretStore {
  values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
}

describe("YandexDiskConnectionService", () => {
  it("keeps OAuth state and PKCE verifier server-side", async () => {
    const secrets = new MemorySecrets();
    const service = new YandexDiskConnectionService(
      {
        clientId: "client-id",
        redirectUri: "https://example.test/oauth/yandex/callback",
        scopes: ["cloud_api:disk.read", "cloud_api:disk.write"],
      },
      secrets,
    );

    const { authorizationUrl } = await service.begin();
    const url = new URL(authorizationUrl);

    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("state")).toBeTruthy();
    expect(secrets.values.has("media:yandex:oauth_state")).toBe(true);
    expect(secrets.values.has("media:yandex:pkce_verifier")).toBe(true);
    expect(authorizationUrl).not.toContain("pkce_verifier");
  });

  it("stores token after valid callback and clears transient OAuth state", async () => {
    const secrets = new MemorySecrets();
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          access_token: "access-secret",
          token_type: "bearer",
          expires_in: 3600,
          refresh_token: "refresh-secret",
          scope: "cloud_api:disk.read cloud_api:disk.write",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    const service = new YandexDiskConnectionService(
      {
        clientId: "client-id",
        redirectUri: "https://example.test/oauth/yandex/callback",
        scopes: ["cloud_api:disk.read", "cloud_api:disk.write"],
      },
      secrets,
      fetchImpl,
    );

    const { authorizationUrl } = await service.begin();
    const state = new URL(authorizationUrl).searchParams.get("state");

    const status = await service.complete({
      code: "code-1",
      state,
    });

    expect(status.connected).toBe(true);
    expect(await service.status()).toEqual({
      connected: true,
      provider: "yandex",
    });
    expect(await service.getAccessTokenForServerUse()).toBe("access-secret");
    expect(secrets.values.has("media:yandex:oauth_state")).toBe(false);
    expect(secrets.values.has("media:yandex:pkce_verifier")).toBe(false);
    expect(secrets.values.get("media:yandex:refresh_token")).toBe("refresh-secret");
  });

  it("rejects state mismatch and does not create a connection", async () => {
    const secrets = new MemorySecrets();
    const service = new YandexDiskConnectionService(
      {
        clientId: "client-id",
        redirectUri: "https://example.test/oauth/yandex/callback",
        scopes: ["cloud_api:disk.read"],
      },
      secrets,
      async () => {
        throw new Error("token endpoint must not be called");
      },
    );

    await service.begin();

    await expect(
      service.complete({
        code: "code-1",
        state: "wrong-state",
      }),
    ).rejects.toThrow("state mismatch");

    expect(await service.status()).toEqual({
      connected: false,
      provider: "yandex",
    });
  });

  it("disconnects without exposing the stored token", async () => {
    const secrets = new MemorySecrets();
    secrets.values.set("media:yandex:access_token", "secret");

    const service = new YandexDiskConnectionService(
      {
        clientId: "client-id",
        redirectUri: "https://example.test/oauth/yandex/callback",
        scopes: [],
      },
      secrets,
    );

    expect((await service.disconnect()).connected).toBe(false);
    expect(secrets.values.has("media:yandex:access_token")).toBe(false);
  });
});
