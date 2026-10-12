import { describe, expect, it } from "vitest";
import { canonicalJsonV2, sha256HexV2 } from "./canonical-hash-v2";
import { buildCanonicalMediaPlanV2, validateCanonicalMediaPlanV2 } from "./canonical-media-timeline-v2";
import { createContentItemV2, type AssetDescriptorV2 } from "./content-format-v2";
import { routeMediaExecutionV2, validateExecutorResultV2, type ExecutorCapabilitiesV2 } from "./media-execution-router-v2";

const ASSET_HASH = "a".repeat(64);
const RESULT_HASH = "f".repeat(64);

function asset(id: string, overrides: Partial<AssetDescriptorV2> = {}): AssetDescriptorV2 {
  return {
    mediaAssetId: id,
    kind: "video",
    contentHash: ASSET_HASH,
    bytes: 1_000,
    mimeType: "video/mp4",
    width: 1080,
    height: 1920,
    rotationDegrees: 0,
    videoCodec: "h264",
    durationMs: 22_000,
    sampleAspectRatio: { numerator: 1, denominator: 1 },
    ...overrides,
  };
}

function content(assets: AssetDescriptorV2[]) {
  return createContentItemV2({
    contentItemId: "content-hardened",
    revision: 1,
    plannedSourceKinds: assets.map((entry) => entry.kind),
    sourceAssets: assets,
    targetPlatforms: ["instagram"],
    approvedIdea: { ideaId: "idea-1", version: 1 },
    shootingSessionId: "shoot-1",
    publicationObjective: "Harden V2",
    scheduledPublicationTime: null,
    priority: "normal",
    deadline: null,
    compositionIntent: { preserveSourceComposition: true },
    audioIntent: { normalizeSpeech: true },
    subtitleIntent: { enabled: true, language: "ru" },
    captionCopyId: null,
    publicationStatus: "captured",
  });
}

function executor(overrides: Partial<ExecutorCapabilitiesV2> = {}): ExecutorCapabilitiesV2 {
  return {
    executorId: "executor-a",
    executorKind: "desktop",
    supportedPublicationTypes: ["reel"],
    inputDecodeCodecs: ["h264"],
    outputEncodeCodecs: ["h264"],
    maxAssetBytes: 1_000_000,
    maxAggregateBytes: 2_000_000,
    maxWidth: 4096,
    maxHeight: 4096,
    compositionModes: ["crop", "contain_background", "layout_composite"],
    encodeGenerations: 1,
    semanticFeatures: ["video_timeline", "subtitles", "audio_normalization"],
    availability: "available",
    observedAt: "2026-10-12T12:00:00.000Z",
    heartbeatAt: "2026-10-12T12:00:30.000Z",
    expiresAt: "2026-10-12T12:05:00.000Z",
    expectedCompletionTimeMs: 20_000,
    estimatedCostCents: 0,
    costClass: "owned",
    qualityTier: 2,
    ...overrides,
  };
}

describe("Media Execution V2 adversarial invariants", () => {
  it("uses canonical SHA-256 and derives different content hashes from changed source state", () => {
    expect(sha256HexV2("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(canonicalJsonV2({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    const first = content([asset("asset-1")]);
    const changed = content([asset("asset-1", { bytes: 1_001 })]);
    expect(first.revisionHash).not.toBe(changed.revisionHash);
    expect(() => createContentItemV2({ ...first, revisionHash: RESULT_HASH })).toThrow(/revisionHash does not match/i);
  });

  it("derives executable clip bounds from probed source durations", () => {
    const item = content([asset("short", { durationMs: 4_200 }), asset("long", { contentHash: "b".repeat(64), durationMs: 8_300 })]);
    const plan = buildCanonicalMediaPlanV2(item, { timelineVersion: 1 });
    expect(plan.kind).toBe("video_timeline");
    if (plan.kind !== "video_timeline") throw new Error("expected video plan");
    expect(plan.clips.map((clip) => clip.outMs)).toEqual([4_200, 8_300]);
    expect(plan.targetDurationMs).toBe(12_500);
  });

  it("checks every source and blocks clipped evidence even for contain mode", () => {
    const item = content([asset("safe"), asset("square", { contentHash: "b".repeat(64), width: 400, height: 400 })]);
    const plan = buildCanonicalMediaPlanV2(item, {
      timelineVersion: 1,
      compositionDecisions: {
        safe: { mode: "crop" },
        square: { mode: "contain_background", evidence: { producer: "subject", version: "1", confidence: 0.99, subjectClipped: true, safeZoneClipped: false } },
      },
    });
    expect(plan.preflight.actionable).toBe(false);
    expect(plan.preflight.reasons).toContain("subject_clipped");
  });

  it("deep-freezes plans and detects source-reference or timeline-hash drift", () => {
    const item = content([asset("asset-1")]);
    const plan = buildCanonicalMediaPlanV2(item, { timelineVersion: 1 });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.lineage.sourceAssets)).toBe(true);
    const forged = JSON.parse(JSON.stringify(plan));
    forged.lineage.sourceAssets[0].contentHash = "b".repeat(64);
    expect(() => validateCanonicalMediaPlanV2(item, forged)).toThrow(/source lineage drift/i);
    expect(() => buildCanonicalMediaPlanV2(item, { timelineVersion: 1, timelineHash: RESULT_HASH })).toThrow(/timelineHash does not match/i);
  });

  it("fails stale heartbeat, insufficient quality, paid cost, and invalid numeric capabilities closed", () => {
    const item = content([asset("asset-1")]);
    const plan = buildCanonicalMediaPlanV2(item, { timelineVersion: 1 });
    const decision = routeMediaExecutionV2({
      contentItem: item,
      plan,
      executors: [
        executor({ executorId: "stale", observedAt: "2026-10-12T11:00:00.000Z", heartbeatAt: "2026-10-12T11:00:30.000Z" }),
        executor({ executorId: "low", qualityTier: 1 }),
        executor({ executorId: "costly", estimatedCostCents: 1 }),
      ],
      minimumQualityTier: 2,
      now: "2026-10-12T12:01:00.000Z",
    });
    expect(decision.status).toBe("no_eligible_executor");
    if (decision.status !== "no_eligible_executor") throw new Error("expected no executor");
    expect(decision.rejections.find((entry) => entry.executorId === "stale")?.reasons).toContain("stale_capability_snapshot");
    expect(decision.rejections.find((entry) => entry.executorId === "low")?.reasons).toContain("quality_tier_insufficient");
    expect(decision.rejections.find((entry) => entry.executorId === "costly")?.reasons).toContain("paid_executor_disallowed");
    expect(() => routeMediaExecutionV2({ contentItem: item, plan, executors: [executor({ maxAssetBytes: Number.NaN })], now: "2026-10-12T12:01:00.000Z" })).toThrow(/invalid executor capability/i);
  });

  it("binds results to the exact selected executor and a valid result hash", () => {
    const item = content([asset("asset-1")]);
    const plan = buildCanonicalMediaPlanV2(item, { timelineVersion: 1 });
    const baseResult = { executionId: "execution-1", attempt: 1, executorId: "wrong", lineage: plan.lineage, resultHash: RESULT_HASH, qaPolicyVersion: plan.lineage.qaPolicyVersion };
    expect(() => validateExecutorResultV2(plan, { executionId: "execution-1", attempt: 1, executorId: "selected" }, baseResult)).toThrow(/ownership/i);
    expect(() => validateExecutorResultV2(plan, { executionId: "execution-1", attempt: 1, executorId: "selected" }, { ...baseResult, executorId: "selected", resultHash: "bad" })).toThrow(/result hash/i);
  });
});
