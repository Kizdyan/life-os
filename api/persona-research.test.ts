import { afterEach, describe, expect, it, vi } from "vitest";
import handler, { resolveScenarioResearchProvider } from "./persona-research.js";

const manualItem = {
  id: "source-1",
  url: "https://www.youtube.com/shorts/acting-reference",
  platform: "youtube" as const,
  observedAt: "2026-10-30T10:00:00.000Z",
  observationStatus: "metadata_only" as const,
  title: "Актёрский комедийный скетч",
  evidence: { kind: "manual_link" as const, observedFields: ["url", "title"] },
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Persona research provider safety", () => {
  it("keeps Perplexity disabled by default and makes zero network calls", () => {
    const network = vi.fn();
    vi.stubGlobal("fetch", network);

    expect(resolveScenarioResearchProvider({ provider: "perplexity" })).toMatchObject({
      provider: "perplexity",
      state: "disabled",
    });
    expect(network).not.toHaveBeenCalled();
  });

  it("does not activate a paid provider when its key or spend limit is absent", () => {
    vi.stubEnv("PERSONA_ENABLE_PERPLEXITY", "true");

    expect(resolveScenarioResearchProvider({ provider: "perplexity" })).toMatchObject({ state: "not_configured", reason: "api_key_missing" });
    vi.stubEnv("PERPLEXITY_API_KEY", "not-a-real-key");
    expect(resolveScenarioResearchProvider({ provider: "perplexity" })).toMatchObject({ state: "not_configured", reason: "request_limit_missing" });
  });

  it("accepts evidence supplied by the user without a provider call", async () => {
    const network = vi.fn();
    vi.stubGlobal("fetch", network);
    expect(resolveScenarioResearchProvider({ provider: "manual", items: [manualItem] })).toEqual({
      provider: "manual",
      state: "ready",
      items: [expect.objectContaining({ id: "source-1", observationStatus: "metadata_only" })],
    });

    const response = await handler.fetch(new Request("http://localhost/api/persona-research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "manual", items: [manualItem] }),
    }));
    expect(response.status).toBe(200);
    expect((await response.json()).state).toBe("ready");
    expect(network).not.toHaveBeenCalled();
  });
});
