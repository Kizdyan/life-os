import { describe, expect, it } from "vitest";
import { routeAICapability, type AICapabilityProvider, type AICapabilityTask } from "./ai-capacity-routing";

const task: AICapabilityTask = {
  domain: "video", classification: "internal", autonomy: "AUTO",
  requiredTools: ["ffmpeg"], minQuality: .7, maxCostPerTask: 2,
};
const provider: AICapabilityProvider = {
  id: "verified-video-adapter", readiness: "verified",
  allowedDataClassification: "internal", autonomousExecutionApproved: true,
  tools: ["ffmpeg"],
  evidence: [{ domain: "video", samples: 5, quality: .9, reliability: .9,
    costPerTask: .5, medianLatencySeconds: 40 }],
};
describe("routeAICapability", () => {
  it("rejects unverified connections", () => {
    const result = routeAICapability(task, [
      { ...provider, id: "marketing-only", readiness: "unverified" }, provider]);
    expect(result.status).toBe("ready");
    expect(result.primary?.id).toBe(provider.id);
    expect(result.excluded[0].reason).toBe("Connection not verified");
  });
  it("prevents exposure of personal data to limited providers", () => {
    const result = routeAICapability({ ...task, classification: "personal" }, [provider]);
    expect(result.primary).toBeNull();
    expect(result.status).toBe("no_verified_provider");
  });
  it("rejects missing tools, unknown costs and budget overruns", () => {
    const result = routeAICapability(task, [
      { ...provider, id: "no-tool", tools: [] },
      { ...provider, id: "no-cost",
        evidence: [{ ...provider.evidence[0], costPerTask: null }] },
      { ...provider, id: "over-budget",
        evidence: [{ ...provider.evidence[0], costPerTask: 3 }] },
    ]);
    expect(result.excluded).toHaveLength(3);
    expect(result.status).toBe("no_verified_provider");
  });
  it("keeps approval-tier execution locked", () => {
    const result = routeAICapability({ ...task, autonomy: "APPROVAL" }, [provider]);
    expect(result.status).toBe("approval_required");
    expect(result.mayExecuteWithoutApproval).toBe(false);
  });
  it("requires actual benchmark evidence", () => {
    const result = routeAICapability(task, [
      { ...provider, evidence: [{ ...provider.evidence[0], samples: 0 }] }]);
    expect(result.status).toBe("no_verified_provider");
  });
  it("ranks by evidence, not vendor identity", () => {
    const weak = { ...provider, id: "provider-a",
      evidence: [{ ...provider.evidence[0], quality: .75, reliability: .8 }] };
    const strong = { ...provider, id: "provider-z" };
    const result = routeAICapability(task, [weak, strong]);
    expect(result.primary?.id).toBe("provider-z");
    expect(result.fallbacks[0].id).toBe("provider-a");
  });
  it("requires verified autonomy permission", () => {
    const result = routeAICapability(task, [
      { ...provider, autonomousExecutionApproved: false }]);
    expect(result.status).toBe("no_verified_provider");
  });
  it("validates task budget and benchmark samples", () => {
    expect(() => routeAICapability({ ...task, maxCostPerTask: -1 }, [provider])).toThrow();
    expect(() => routeAICapability({ ...task, minMeasuredSamples: 0 }, [provider])).toThrow();
  });
});
