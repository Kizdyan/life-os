import {
  assertYandexOAuthState,
  buildYandexAuthorizationUrl,
  createPkceChallenge,
  exchangeYandexAuthorizationCode,
} from "./yandex-oauth";

export interface ServerSecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface YandexDiskConnectionConfig {
  clientId: string;
  clientSecret?: string | null;
  redirectUri: string;
  scopes: string[];
  secretPrefix?: string;
}

export interface YandexDiskConnectionStatus {
  connected: boolean;
  provider: "yandex";
}

export class YandexDiskConnectionService {
  private readonly prefix: string;

  constructor(
    private readonly config: YandexDiskConnectionConfig,
    private readonly secrets: ServerSecretStore,
    private readonly fetchImpl?: typeof fetch,
  ) {
    this.prefix = config.secretPrefix?.trim() || "media:yandex";
  }

  async begin(): Promise<{ authorizationUrl: string }> {
    const state = randomUrlSafe(32);
    const verifier = randomUrlSafe(64);
    const challenge = await createPkceChallenge(verifier);

    await this.secrets.set(this.key("oauth_state"), state);
    await this.secrets.set(this.key("pkce_verifier"), verifier);

    return {
      authorizationUrl: buildYandexAuthorizationUrl({
        clientId: this.config.clientId,
        redirectUri: this.config.redirectUri,
        state,
        scopes: this.config.scopes,
        codeChallenge: challenge,
      }),
    };
  }

  async complete(input: {
    code: string;
    state: string | null | undefined;
  }): Promise<YandexDiskConnectionStatus> {
    const expectedState = await this.secrets.get(this.key("oauth_state"));
    const verifier = await this.secrets.get(this.key("pkce_verifier"));
    if (!expectedState || !verifier) {
      throw new Error("Yandex OAuth session is missing or expired");
    }

    assertYandexOAuthState(expectedState, input.state);

    try {
      const token = await exchangeYandexAuthorizationCode({
        code: input.code,
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        codeVerifier: verifier,
        fetchImpl: this.fetchImpl,
      });

      await this.secrets.set(this.key("access_token"), token.accessToken);
      if (token.refreshToken) {
        await this.secrets.set(this.key("refresh_token"), token.refreshToken);
      }
      return { connected: true, provider: "yandex" };
    } finally {
      await this.secrets.delete(this.key("oauth_state"));
      await this.secrets.delete(this.key("pkce_verifier"));
    }
  }

  async status(): Promise<YandexDiskConnectionStatus> {
    return {
      connected: Boolean(await this.secrets.get(this.key("access_token"))),
      provider: "yandex",
    };
  }

  async getAccessTokenForServerUse(): Promise<string> {
    const token = await this.secrets.get(this.key("access_token"));
    if (!token) throw new Error("Yandex.Disk is not connected");
    return token;
  }

  async disconnect(): Promise<YandexDiskConnectionStatus> {
    await this.secrets.delete(this.key("access_token"));
    await this.secrets.delete(this.key("refresh_token"));
    await this.secrets.delete(this.key("oauth_state"));
    await this.secrets.delete(this.key("pkce_verifier"));
    return { connected: false, provider: "yandex" };
  }

  private key(name: string): string {
    return `${this.prefix}:${name}`;
  }
}

function randomUrlSafe(bytes: number): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
