const YANDEX_AUTHORIZE_URL = "https://oauth.yandex.ru/authorize";
const YANDEX_TOKEN_URL = "https://oauth.yandex.ru/token";

export interface YandexOAuthAuthorizationInput {
  clientId: string;
  redirectUri?: string | null;
  state: string;
  scopes?: string[];
  codeChallenge?: string | null;
  forceConfirm?: boolean;
}

export interface YandexOAuthTokenResponse {
  accessToken: string;
  tokenType: string | null;
  expiresIn: number | null;
  refreshToken: string | null;
  scope: string | null;
}

export function buildYandexAuthorizationUrl(
  input: YandexOAuthAuthorizationInput,
): string {
  if (!input.clientId.trim()) throw new Error("Yandex OAuth clientId is required");
  if (!input.state.trim()) throw new Error("Yandex OAuth state is required");

  const url = new URL(YANDEX_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId.trim());
  url.searchParams.set("state", input.state.trim());

  if (input.redirectUri?.trim()) {
    url.searchParams.set("redirect_uri", input.redirectUri.trim());
  }
  if (input.scopes?.length) {
    url.searchParams.set("scope", input.scopes.join(" "));
  }
  if (input.codeChallenge?.trim()) {
    url.searchParams.set("code_challenge", input.codeChallenge.trim());
    url.searchParams.set("code_challenge_method", "S256");
  }
  if (input.forceConfirm) {
    url.searchParams.set("force_confirm", "yes");
  }

  return url.toString();
}

export function assertYandexOAuthState(
  expectedState: string,
  returnedState: string | null | undefined,
): void {
  if (!expectedState || !returnedState || expectedState !== returnedState) {
    throw new Error("Yandex OAuth state mismatch");
  }
}

export async function createPkceChallenge(verifier: string): Promise<string> {
  const normalized = verifier.trim();
  if (normalized.length < 43 || normalized.length > 128) {
    throw new Error("PKCE verifier must be 43-128 characters");
  }

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalized),
  );
  return toBase64Url(new Uint8Array(digest));
}

export async function exchangeYandexAuthorizationCode(input: {
  code: string;
  clientId: string;
  clientSecret?: string | null;
  codeVerifier?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<YandexOAuthTokenResponse> {
  const code = input.code.trim();
  const clientId = input.clientId.trim();
  if (!code) throw new Error("Yandex OAuth authorization code is required");
  if (!clientId) throw new Error("Yandex OAuth clientId is required");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
  });
  if (input.clientSecret?.trim()) {
    body.set("client_secret", input.clientSecret.trim());
  }
  if (input.codeVerifier?.trim()) {
    body.set("code_verifier", input.codeVerifier.trim());
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(YANDEX_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    const description =
      typeof payload.error_description === "string"
        ? payload.error_description
        : typeof payload.error === "string"
          ? payload.error
          : response.statusText;
    throw new Error(`Yandex OAuth token exchange failed: ${description}`);
  }

  const accessToken =
    typeof payload.access_token === "string" ? payload.access_token : "";
  if (!accessToken) {
    throw new Error("Yandex OAuth token response has no access_token");
  }

  return {
    accessToken,
    tokenType: typeof payload.token_type === "string" ? payload.token_type : null,
    expiresIn: typeof payload.expires_in === "number" ? payload.expires_in : null,
    refreshToken:
      typeof payload.refresh_token === "string" ? payload.refresh_token : null,
    scope: typeof payload.scope === "string" ? payload.scope : null,
  };
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary);
  return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
