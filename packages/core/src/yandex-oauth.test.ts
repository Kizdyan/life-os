import { describe, expect, it } from "vitest";
import {
  assertYandexOAuthState,
  buildYandexAuthorizationUrl,
  createPkceChallenge,
  exchangeYandexAuthorizationCode,
} from "./yandex-oauth";

describe("Yandex OAuth helpers", () => {
  it("builds authorization-code URL with state and PKCE", () => {
    const url = new URL(
      buildYandexAuthorizationUrl({
        clientId: "client-123",
        redirectUri: "https://example.test/oauth/yandex/callback",
        state: "state-123",
        scopes: ["cloud_api:disk.read", "cloud_api:disk.write"],
        codeChallenge: "challenge",
      }),
    );

    expect(url.origin).toBe("https://oauth.yandex.ru");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("rejects state mismatch", () => {
    expect(() => assertYandexOAuthState("expected", "wrong")).toThrow(
      "state mismatch",
    );
  });

  it("creates an S256 PKCE challenge", async () => {
    const verifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
    const challenge = await createPkceChallenge(verifier);

    expect(challenge.length).toBeGreaterThan(20);
    expect(challenge).not.toContain("+");
    expect(challenge).not.toContain("/");
    expect(challenge).not.toContain("=");
  });

  it("exchanges authorization code without exposing token in URLs", async () => {
    let capturedUrl = "";
    let capturedBody = "";
    const fetchImpl: typeof fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedBody = String(init?.body);
      return new Response(
        JSON.stringify({
          access_token: "secret-access-token",
          token_type: "bearer",
          expires_in: 3600,
          refresh_token: "refresh-token",
          scope: "cloud_api:disk.read cloud_api:disk.write",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const result = await exchangeYandexAuthorizationCode({
      code: "auth-code",
      clientId: "client-id",
      codeVerifier: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~",
      fetchImpl,
    });

    expect(capturedUrl).toBe("https://oauth.yandex.ru/token");
    expect(capturedUrl).not.toContain("secret-access-token");
    expect(capturedBody).toContain("grant_type=authorization_code");
    expect(capturedBody).toContain("code=auth-code");
    expect(result.accessToken).toBe("secret-access-token");
  });
});
