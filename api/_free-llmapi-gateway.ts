/**
 * EXPERIMENTAL server-side adapter for a locally operated FreeLLMAPI gateway.
 *
 * This file is NOT an HTTP endpoint and must not be bundled into a browser.
 * No service is installed, no credentials are acquired, and no provider is
 * automatically enabled. A verified, explicitly approved public-only route is
 * required before making a completion request.
 */
import type { AgentSelection, AgentTask } from "../packages/core/src/agent-capability-router";

export interface FreeLlmGatewayConfig {
  /** Explicit opt-in; defaults to disabled. */
  enabled: boolean;
  /** Only localhost/127.0.0.1 loopback endpoints are accepted in this pilot. */
  endpoint: string;
  /** Server-side unified gateway key. Never place it in front-end code. */
  apiKey: string;
  /** Actual gateway model ID; not a marketing display name. */
  modelId: string;
  /** Identifies the experimental profile selected by the existing router. */
  agentId: string;
  /** Explicitly reviewed/approved gateway model IDs. */
  approvedModelIds: readonly string[];
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export interface FreeLlmCompletion {
  text: string;
  actualProvider: string | null;
  model: string | null;
  usage: { promptTokens: number | null; completionTokens: number | null };
}

function localOrigin(endpoint: string): string {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("Invalid FreeLLMAPI endpoint");
  }
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username || url.password || url.search || url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new Error("FreeLLMAPI pilot only accepts a local HTTP loopback origin");
  }
  return url.origin;
}

function verifyConfig(config: FreeLlmGatewayConfig): string {
  if (!config.enabled) throw new Error("FreeLLMAPI pilot is disabled");
  const origin = localOrigin(config.endpoint);
  if (!config.apiKey?.trim()) throw new Error("Missing local gateway key");
  if (!config.agentId?.trim()) throw new Error("Missing gateway agent identity");
  if (!config.modelId?.trim() ||
      !config.approvedModelIds.includes(config.modelId)) {
    throw new Error("Gateway model has not been explicitly approved");
  }
  return origin;
}

function timeout(config: FreeLlmGatewayConfig): AbortSignal {
  const ms = config.timeoutMs ?? 8000;
  if (!Number.isInteger(ms) || ms < 100 || ms > 30000) {
    throw new Error("Gateway timeout outside bounded range");
  }
  return AbortSignal.timeout(ms);
}

function authorization(config: FreeLlmGatewayConfig): HeadersInit {
  return {
    "Authorization": `Bearer ${config.apiKey}`,
    "Accept": "application/json",
  };
}

function readTokens(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value : null;
}

async function jsonFromGateway(response: Response): Promise<unknown> {
  if (!response.ok) {
    // Do not propagate untrusted gateway response bodies or key-bearing URLs.
    throw new Error(`FreeLLMAPI gateway returned HTTP ${response.status}`);
  }
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > 262144) throw new Error("Gateway response exceeds safety limit");
  const text = await response.text();
  if (text.length > 262144) throw new Error("Gateway response exceeds safety limit");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Gateway returned invalid JSON");
  }
}

/** Read-only capability discovery; this does not establish model quality. */
export async function listLocalFreeLlmModels(
  config: FreeLlmGatewayConfig,
  transport: typeof fetch = fetch,
): Promise<string[]> {
  const origin = verifyConfig(config);
  let response: Response;
  try {
    response = await transport(`${origin}/v1/models`, {
      headers: authorization(config),
      signal: timeout(config),
      redirect: "error",
      cache: "no-store",
    });
  } catch {
    throw new Error("Local FreeLLMAPI gateway unavailable");
  }
  const body = await jsonFromGateway(response);
  if (!body || typeof body !== "object" || !("data" in body) ||
      !Array.isArray(body.data)) throw new Error("Unexpected gateway models response");
  const entries: unknown[] = body.data;
  return entries.flatMap(entry => {
    if (!entry || typeof entry !== "object" || !("id" in entry)) return [];
    return typeof entry.id === "string" ? [entry.id] : [];
  });
}

/**
 * Only explicit PUBLIC tasks selected by the existing capability router.
 * The caller must classify input content correctly; this is not a DLP scanner.
 * All cloud models behind FreeLLMAPI remain third parties, even if the
 * gateway itself runs on localhost.
 */
export async function completePublicFreeLlmTask(
  task: AgentTask,
  selection: AgentSelection,
  config: FreeLlmGatewayConfig,
  publicPrompt: string,
  transport: typeof fetch = fetch,
): Promise<FreeLlmCompletion> {
  if (task.dataClass !== "public") {
    throw new Error("Experimental FreeLLMAPI route only permits explicit PUBLIC data");
  }
  if (task.risk === "approval" && task.approved !== true) {
    throw new Error("Approval required before execution");
  }
  if (selection.status !== "assigned" ||
      selection.agentId !== config.agentId ||
      !["other", "local"].includes(selection.provider ?? "")) {
    throw new Error("Existing capability router did not authorize this provider");
  }
  if (!publicPrompt.trim() || publicPrompt.length > 12000) {
    throw new Error("Public synthetic prompt is empty or exceeds pilot limit");
  }
  const origin = verifyConfig(config);
  const maxTokens = config.maxOutputTokens ?? 128;
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 256) {
    throw new Error("Output token budget outside pilot limit");
  }
  let response: Response;
  try {
    response = await transport(`${origin}/v1/chat/completions`, {
      method: "POST",
      headers: { ...authorization(config), "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.modelId,
        messages: [{ role: "user", content: publicPrompt }],
        max_tokens: maxTokens,
        temperature: 0,
      }),
      signal: timeout(config),
      redirect: "error",
      cache: "no-store",
    });
  } catch {
    throw new Error("Local FreeLLMAPI gateway unavailable");
  }
  const body = await jsonFromGateway(response);
  if (!body || typeof body !== "object") throw new Error("Invalid completion response");
  const result = body as {
    choices?: Array<{ message?: { content?: unknown } }>;
    model?: unknown;
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
  };
  const text = result.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Gateway returned no completion text");
  }
  // Treat gateway-provided routing attribution as untrusted informational data.
  const routedVia = response.headers.get("x-routed-via");
  return {
    text,
    actualProvider: routedVia?.slice(0, 200) ?? null,
    model: typeof result.model === "string" ? result.model : null,
    usage: {
      promptTokens: readTokens(result.usage?.prompt_tokens),
      completionTokens: readTokens(result.usage?.completion_tokens),
    },
  };
}
