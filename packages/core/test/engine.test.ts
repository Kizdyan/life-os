import { describe, expect, it } from "vitest";
import { AutonomyEngine } from "../src/engine";
import { ToolRegistry, type AuditEntry } from "../src/actions";
import type { ActionRequest } from "../src/types";

const makeAction = (risks: ActionRequest["risks"]): ActionRequest => ({
  id: "a1",
  actionGroupId: "g1",
  tool: "life.update",
  input: { id: "item-1" },
  risks,
  reversible: true,
  idempotencyKey: "key-1",
});

describe("AutonomyEngine", () => {
  it("executes and verifies safe work", async () => {
    const tools = new ToolRegistry();
    tools.register({ name: "life.update", execute: async () => ({ undoToken: "u1" }) });
    const history: AuditEntry[] = [];
    const engine = new AutonomyEngine(
      tools,
      { verify: async () => ({ state: "verified", evidence: { persisted: true } }) },
      { save: async (entry) => void history.push({ ...entry }) },
    );

    const result = await engine.run(makeAction(["reversible"]));
    expect(result.state).toBe("verified");
    expect(history.length).toBeGreaterThan(2);
  });

  it("does not execute approval-gated work", async () => {
    let executed = false;
    const tools = new ToolRegistry();
    tools.register({ name: "life.update", execute: async () => { executed = true; return {}; } });
    const engine = new AutonomyEngine(
      tools,
      { verify: async () => ({ state: "verified" }) },
      { save: async () => undefined },
    );

    const result = await engine.run(makeAction(["production"]));
    expect(result.state).toBe("awaiting_approval");
    expect(executed).toBe(false);
  });
});
