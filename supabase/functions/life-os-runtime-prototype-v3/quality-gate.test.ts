import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

describe("prototype v3 fail-closed quality contract", () => {
  it("requires market evidence and a quality score of at least 80", () => {
    expect(source).toContain("score < 80");
    expect(source).toContain("evidence.length === 0");
    expect(source).toContain("deterministic_quality_gate_failed");
  });

  it("limits shoot time and final video duration", () => {
    expect(source).toContain("shoot < 5 || shoot > 15");
    expect(source).toContain("duration < 15 || duration > 30");
  });

  it("requires a complete shooting brief", () => {
    expect(source).toContain("validateBrief(brief)");
    expect(source).toContain("invalid_shooting_brief:");
  });
});
