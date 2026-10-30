import { env, json } from "./_media-session.js";
import {
  validateScenarioResearch,
  type ScenarioResearchItem,
} from "../packages/core/src/persona-scenario-intelligence.js";

type ResearchRequest = {
  provider?: "manual" | "perplexity";
  items?: unknown;
};

type PerplexityState =
  | { provider: "perplexity"; state: "disabled"; reason: "explicit_opt_in_required" }
  | { provider: "perplexity"; state: "not_configured"; reason: "api_key_missing" | "request_limit_missing" }
  | { provider: "perplexity"; state: "configured_but_inactive"; requestLimit: number; requiresExplicitSearch: true };

type ManualState =
  | { provider: "manual"; state: "ready"; items: ScenarioResearchItem[] }
  | { provider: "manual"; state: "needs_evidence"; items: [] };

/**
 * Reports a safe research capability state. This adapter deliberately never
 * calls Perplexity: an enabled key only makes an explicit, audited future
 * search action eligible. Manual evidence is the working, offline-first path.
 */
export function resolveScenarioResearchProvider(request: ResearchRequest): PerplexityState | ManualState {
  if (request.provider === "perplexity") {
    if (env("PERSONA_ENABLE_PERPLEXITY") !== "true") {
      return { provider: "perplexity", state: "disabled", reason: "explicit_opt_in_required" };
    }
    if (!env("PERPLEXITY_API_KEY")) {
      return { provider: "perplexity", state: "not_configured", reason: "api_key_missing" };
    }
    const requestLimit = Number(env("PERSONA_PERPLEXITY_REQUEST_LIMIT"));
    if (!Number.isSafeInteger(requestLimit) || requestLimit <= 0) {
      return { provider: "perplexity", state: "not_configured", reason: "request_limit_missing" };
    }
    return { provider: "perplexity", state: "configured_but_inactive", requestLimit, requiresExplicitSearch: true };
  }
  if (!Array.isArray(request.items) || request.items.length === 0) {
    return { provider: "manual", state: "needs_evidence", items: [] };
  }
  return { provider: "manual", state: "ready", items: validateScenarioResearch(request.items as ScenarioResearchItem[]) };
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "GET") {
      return json({ manual: resolveScenarioResearchProvider({ provider: "manual" }), perplexity: resolveScenarioResearchProvider({ provider: "perplexity" }) });
    }
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { Allow: "GET, POST" });
    try {
      const body = await request.json() as ResearchRequest;
      return json(resolveScenarioResearchProvider(body));
    } catch (error) {
      const message = error instanceof Error ? error.message : "invalid_research_request";
      return json({ error: message }, 400);
    }
  },
};
