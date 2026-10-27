import { describe, expect, it } from "vitest";
import { ErikaAutomationRunner, type AutomationJob } from "./erika-automation-runner";
import type { AuditEntry } from "./actions";
import type { ActionRequest } from "./types";

function action(id: string, tool = "life.safe"): ActionRequest {
  return { id, actionGroupId: id, tool, input: {}, risks: ["reversible"], reversible: true, idempotencyKey: "key-" + id };
}
function entry(request: ActionRequest, state: AuditEntry["state"]): AuditEntry {
  return {
    id: request.id, action: request, state,
    policy: { level: state === "awaiting_approval" ? "approval" : "auto", reasons: [] },
    createdAt: "2026-10-27T00:00:00Z", updatedAt: "2026-10-27T00:00:00Z",
  };
}
const job = (id: string, dependsOn?: string[]): AutomationJob => ({ id, action: action(id), dependsOn });

describe("ErikaAutomationRunner", () => {
  it("executes dependencies before dependents and requires Observer verification", async () => {
    const seen: string[] = [];
    const runner = new ErikaAutomationRunner({ run: async request => {
      seen.push(request.id);
      return entry(request, "verified");
    } });
    const result = await runner.run([job("publish", ["prepare"]), job("prepare")]);
    expect(seen).toEqual(["prepare", "publish"]);
    expect(result.results.map(item => item.status)).toEqual(["verified", "verified"]);
    expect(result.verified).toBe(2);
  });

  it("blocks downstream work when the executor is not verified", async () => {
    const seen: string[] = [];
    const runner = new ErikaAutomationRunner({ run: async request => {
      seen.push(request.id);
      return entry(request, "executed");
    } });
    const result = await runner.run([job("first"), job("second", ["first"])]);
    expect(seen).toEqual(["first"]);
    expect(result.results.map(item => item.status)).toEqual(["failed", "blocked"]);
  });

  it("does not execute approval-gated downstream work", async () => {
    const runner = new ErikaAutomationRunner({ run: async request => entry(request, "awaiting_approval") });
    const result = await runner.run([job("approval"), job("dependent", ["approval"])]);
    expect(result.awaitingApproval).toBe(1);
    expect(result.blocked).toBe(1);
  });

  it("detects dependency cycles without executing anything", async () => {
    let count = 0;
    const runner = new ErikaAutomationRunner({ run: async request => {
      count++;
      return entry(request, "verified");
    } });
    const result = await runner.run([job("a", ["b"]), job("b", ["a"])]);
    expect(result.blocked).toBe(2);
    expect(count).toBe(0);
  });

  it("rejects duplicate IDs, action IDs and unknown dependencies", async () => {
    const runner = new ErikaAutomationRunner({ run: async request => entry(request, "verified") });
    await expect(runner.run([job("a"), job("a")])).rejects.toThrow(/Duplicate/);
    await expect(runner.run([job("a", ["missing"])])).rejects.toThrow(/dependency/);
    await expect(runner.run([{ ...job("a"), action: action("shared") }, { ...job("b"), action: action("shared") }])).rejects.toThrow(/action id/);
  });

  it("retries only allowlisted idempotent tools with a hard cap of three", async () => {
    let calls = 0;
    const runner = new ErikaAutomationRunner({ run: async request => {
      calls++;
      return entry(request, calls < 3 ? "failed" : "verified");
    } }, { retryableTools: ["life.safe"], maxAttempts: 100 });
    const result = await runner.run([job("safe")]);
    expect(result.verified).toBe(1);
    expect(result.results[0].attempts).toBe(3);
  });

  it("never retries an external tool that is not explicitly allowlisted", async () => {
    let calls = 0;
    const runner = new ErikaAutomationRunner({ run: async request => {
      calls++;
      return entry(request, "failed");
    } }, { retryableTools: ["life.safe"], maxAttempts: 3 });
    const result = await runner.run([{ id: "external", action: action("external", "external.publish") }]);
    expect(calls).toBe(1);
    expect(result.failed).toBe(1);
  });
});
