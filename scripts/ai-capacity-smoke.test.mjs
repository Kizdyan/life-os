/**
 * Dependency-free smoke checks for the AI Capacity OS P0 modules.
 *
 * Run with Node.js 22.16+ from the repository root:
 *   node --experimental-strip-types --test scripts/ai-capacity-smoke.test.mjs
 *
 * These checks deliberately do NOT replace npm test, typecheck or E2E.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { routeAICapability } from "../packages/core/src/ai-capacity-routing.ts";
import { assessPersonaReelExport } from "../packages/core/src/media-export-qa.ts";

const provider = {
  id: "benchmark-verified-local",
  readiness: "verified",
  allowedDataClassification: "internal",
  autonomousExecutionApproved: true,
  tools: ["ffmpeg"],
  evidence: [{
    domain: "video", samples: 4, quality: .95, reliability: .98,
    costPerTask: .2, medianLatencySeconds: 12,
  }],
};
const task = {
  domain: "video", classification: "internal", autonomy: "AUTO",
  requiredTools: ["ffmpeg"], minQuality: .8, maxCostPerTask: 2,
};
const evidence = {
  measuredFromRenderedFile: true, outputSha256: "f".repeat(64),
  width: 1080, height: 1920, fps: 30, durationSeconds: 25,
  hasAudio: true, integratedLufs: -16, truePeakDbfs: -2,
  captionSyncP95Ms: 40, captionsRequired: true,
  renderErrors: 0, blackOrFrozenFrames: 0, visibleArtifacts: 0,
  identityPreserved: true, paletteApproved: true, mediaRightsCleared: true,
};

test("Verified measured provider is eligible", () => {
  const r = routeAICapability(task, [provider]);
  assert.equal(r.status, "ready");
  assert.equal(r.primary?.id, provider.id);
});
test("Unverified provider cannot be selected", () => {
  const r = routeAICapability(task, [{ ...provider, readiness: "unverified" }]);
  assert.equal(r.primary, null);
});
test("Sensitive task cannot use lower-cleared provider", () => {
  const r = routeAICapability({ ...task, classification: "restricted" }, [provider]);
  assert.equal(r.status, "no_verified_provider");
});
test("Unknown costs are rejected", () => {
  const r = routeAICapability(task, [{
    ...provider, evidence: [{ ...provider.evidence[0], costPerTask: null }],
  }]);
  assert.equal(r.primary, null);
});
test("Approval tasks are never authorized by routing", () => {
  const r = routeAICapability({ ...task, autonomy: "APPROVAL" }, [provider]);
  assert.equal(r.status, "approval_required");
  assert.equal(r.mayExecuteWithoutApproval, false);
});
test("Missing benchmark samples cannot authorize provider", () => {
  const r = routeAICapability(task, [{
    ...provider, evidence: [{ ...provider.evidence[0], samples: 0 }],
  }]);
  assert.equal(r.status, "no_verified_provider");
});
test("Complete export evidence passes pure QA gate", () => {
  const r = assessPersonaReelExport(evidence);
  assert.equal(r.status, "pass");
  assert.equal(r.verified, true);
});
test("Unmeasured export cannot pass QA gate", () => {
  const r = assessPersonaReelExport({ ...evidence, measuredFromRenderedFile: false });
  assert.notEqual(r.status, "pass");
});
test("Low resolution and clipped sound fail QA", () => {
  const r = assessPersonaReelExport({
    ...evidence, width: 512, height: 910, truePeakDbfs: .1,
  });
  assert.equal(r.status, "fail");
  assert.ok(r.blockers.length >= 2);
});
test("Missing identity or rights review cannot pass QA", () => {
  const r = assessPersonaReelExport({
    ...evidence, identityPreserved: null, mediaRightsCleared: null,
  });
  assert.equal(r.status, "review_required");
});
