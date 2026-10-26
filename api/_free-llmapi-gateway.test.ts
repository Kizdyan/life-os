import { describe, expect, it } from "vitest";
import { routeAgentTask, type AgentProfile, type AgentTask } from "../packages/core/src/agent-capability-router";
import {
  completePublicFreeLlmTask,
  listLocalFreeLlmModels,
  type FreeLlmGatewayConfig,
} from "./_free-llmapi-gateway";

const config: FreeLlmGatewayConfig = {
  enabled: true,
  endpoint: "http://127.0.0.1:3001",
  apiKey: "synthetic-unit-test-key",
  agentId: "local-free-llmapi",
  modelId: "synthetic-public-model",
  approvedModelIds: ["synthetic-public-model"],
};

const provider: AgentProfile = {
  id: "local-free-llmapi",
  provider: "other",
  available: true,
  // Synthetic TEST FIXTURE only; NOT a real provider benchmark.
  capabilities: { research: 3 },
  tools: ["public_gateway"],
  allowedDataClasses: ["public"],
};

const task: AgentTask = {
  id: "synthetic-public-research",
  projectId: "ai-capacity-experiment",
  dataClass: "public",
  requiredCapabilities: ["research"],
  requiredTools: ["public_gateway"],
  risk: "auto",
};
const selection = routeAgentTask(task, [provider]);

function fakeGateway(
  fn: (url: string, init?: RequestInit) => Response | Promise<Response>,
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) =>
    fn(String(input), init)) as typeof fetch;
}

describe("experimental public-only FreeLLMAPI gateway", () => {
  it("discovers real model IDs through local /v1/models without generating text", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const transport = fakeGateway((url, init) => {
      calls.push({ url, init });
      return Response.json({ data: [{ id: "model-a" }, { id: "model-b" }] });
    });
    await expect(listLocalFreeLlmModels(config, transport))
      .resolves.toEqual(["model-a", "model-b"]);
    expect(calls[0].url).toBe("http://127.0.0.1:3001/v1/models");
    expect(calls[0].init?.redirect).toBe("error");
    expect(calls[0].init?.method).toBeUndefined();
  });

  it("uses the existing router, forwards an explicitly PUBLIC prompt, and records provider attribution", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const transport = fakeGateway((url, init) => {
      calls.push({ url, init });
      return Response.json({
        model: "synthetic-public-model",
        choices: [{ message: { content: "PUBLIC_OK" } }],
        usage: { prompt_tokens: 8, completion_tokens: 2 },
      }, { headers: { "x-routed-via": "fixture/model" } });
    });
    expect(selection).toMatchObject({
      status: "assigned", agentId: config.agentId,
    });
    const output = await completePublicFreeLlmTask(
      task, selection, config, "Classify the public synthetic token A.", transport,
    );
    expect(output).toEqual({
      text: "PUBLIC_OK",
      model: "synthetic-public-model",
      actualProvider: "fixture/model",
      usage: { promptTokens: 8, completionTokens: 2 },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://127.0.0.1:3001/v1/chat/completions");
    const payload = JSON.parse(String(calls[0].init?.body));
    expect(payload).toMatchObject({
      model: "synthetic-public-model",
      max_tokens: 128,
      messages: [{ role: "user", content: "Classify the public synthetic token A." }],
    });
    expect(calls[0].init?.redirect).toBe("error");
    expect(calls[0].init?.headers).toMatchObject({
      "X-FreeLLM-Compress": "off",
    });
    expect(calls[0].init?.headers).toMatchObject({
      Authorization: "Bearer synthetic-unit-test-key",
    });
  });

  it("blocks sensitive or unclassified data BEFORE any network call", async () => {
    let calls = 0;
    const transport = fakeGateway(() => { calls++; return Response.json({}); });
    for (const dataClass of ["sensitive", "internal", undefined] as const) {
      const request = { ...task, dataClass };
      await expect(completePublicFreeLlmTask(
        request, selection, config, "Hidden data", transport,
      )).rejects.toThrow("PUBLIC");
    }
    expect(calls).toBe(0);
  });

  it("refuses unapproved or ineligible agent selection before any network call", async () => {
    let calls = 0;
    const transport = fakeGateway(() => { calls++; return Response.json({}); });
    const blocked = routeAgentTask(task, [
      { ...provider, capabilities: { research: 2 } },
    ]);
    expect(blocked.status).toBe("blocked");
    await expect(completePublicFreeLlmTask(
      task, blocked, config, "A public prompt", transport,
    )).rejects.toThrow("authorize");
    const other = { ...selection, agentId: "not-the-selected-agent" };
    await expect(completePublicFreeLlmTask(
      task, other, config, "A public prompt", transport,
    )).rejects.toThrow("authorize");
    expect(calls).toBe(0);
  });

  it("blocks absent opt-in, unapproved model and missing credentials", async () => {
    let calls = 0;
    const transport = fakeGateway(() => { calls++; return Response.json({}); });
    const overrides = [
      { enabled: false },
      { approvedModelIds: [] },
      { apiKey: "" },
      { maxOutputTokens: 2048 },
    ];
    for (const override of overrides) {
      await expect(completePublicFreeLlmTask(
        task, selection, { ...config, ...override }, "Synthetic only", transport,
      )).rejects.toThrow();
    }
    expect(calls).toBe(0);
  });

  it("rejects external hosts, credentials in URLs, query strings and URL redirects", async () => {
    const endpoints = [
      "https://example.com",
      "http://192.168.1.10:3001",
      "http://user:pass@localhost:3001",
      "http://localhost:3001?key=secret",
      "http://localhost:3001/v1",
    ];
    let calls = 0;
    const transport = fakeGateway(() => { calls++; return Response.json({}); });
    for (const endpoint of endpoints) {
      await expect(listLocalFreeLlmModels(
        { ...config, endpoint }, transport,
      )).rejects.toThrow();
    }
    expect(calls).toBe(0);
    const redirecting = fakeGateway(() => Response.redirect("https://example.com", 302));
    await expect(completePublicFreeLlmTask(
      task, selection, config, "PUBLIC", redirecting,
    )).rejects.toThrow("HTTP 302");
  });

  it("does not silently retry quota errors or expose gateway bodies", async () => {
    let calls = 0;
    const transport = fakeGateway(() => {
      calls++;
      return new Response("potential sensitive upstream diagnostic", { status: 429 });
    });
    await expect(completePublicFreeLlmTask(
      task, selection, config, "PUBLIC", transport,
    )).rejects.toThrow("HTTP 429");
    expect(calls).toBe(1);
  });

  it("rejects malformed gateway outputs and preserves missing usage as unknown", async () => {
    const invalid = fakeGateway(() => Response.json({ choices: [] }));
    await expect(completePublicFreeLlmTask(
      task, selection, config, "PUBLIC", invalid,
    )).rejects.toThrow("no completion");
    const good = fakeGateway(() => Response.json({
      choices: [{ message: { content: "ok" } }],
    }));
    const result = await completePublicFreeLlmTask(
      task, selection, config, "PUBLIC", good,
    );
    expect(result.usage).toEqual({ promptTokens: null, completionTokens: null });
    expect(result.actualProvider).toBeNull();
  });


  it("requests lossless compression only when explicitly enabled and treats savings as provider estimates", async () => {
    const calls: RequestInit[] = [];
    const transport = fakeGateway((_url, init) => {
      if (init) calls.push(init);
      return Response.json({
        choices: [{ message: { content: "PUBLIC_OK" } }],
      }, { headers: { "x-freellm-compress": "lossless; saved~=37" } });
    });
    const result = await completePublicFreeLlmTask(
      task, selection, { ...config, compressionMode: "lossless" },
      "A public synthetic prompt.", transport,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].headers).toMatchObject({
      "X-FreeLLM-Compress": "lossless",
    });
    expect(result.compressionReport).toBe("lossless; saved~=37");
    // The header is not proof of actual billed-token reduction.
    expect(result.usage).toEqual({
      promptTokens: null, completionTokens: null,
    });
  });

  it("does not route an unavailable or private-only gateway with synthetic scores", () => {
    expect(routeAgentTask(task, [
      { ...provider, available: false },
    ]).status).toBe("blocked");
    expect(routeAgentTask(task, [
      { ...provider, allowedDataClasses: ["internal"] },
    ]).status).toBe("blocked");
  });
});
