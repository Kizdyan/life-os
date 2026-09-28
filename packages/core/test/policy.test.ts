import { describe, expect, it } from "vitest";
import { decideAutonomy } from "../src/policy";
import type { ActionRequest } from "../src/types";

const action = (risks: ActionRequest["risks"], reversible = true): ActionRequest => ({
  id: "a1",
  actionGroupId: "g1",
  tool: "test.tool",
  input: {},
  risks,
  reversible,
  idempotencyKey: "k1",
});

describe("autonomy policy", () => {
  it("auto-runs reversible local work", () => {
    expect(decideAutonomy(action(["reversible"])).level).toBe("auto");
  });

  it("reports bounded external work", () => {
    expect(decideAutonomy(action(["external"])).level).toBe("auto_report");
  });

  it("requires approval for destructive or production work", () => {
    expect(decideAutonomy(action(["destructive"])).level).toBe("approval");
    expect(decideAutonomy(action(["production"])).level).toBe("approval");
  });
});
