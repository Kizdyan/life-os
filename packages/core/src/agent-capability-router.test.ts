import { describe, expect, it } from "vitest";
import {
  routeAgentTask,
  type AgentProfile,
} from "./agent-capability-router";
import { buildCapCutWorkPackage } from "./capcut-work-package";
import { planMediaEdit } from "./media-edit-routing";

const codex: AgentProfile = {
  id: "codex-1",
  provider: "codex",
  available: true,
  capabilities: {
    typescript: 5, architecture: 4, code_review: 4,
    video_editing: 3, motion_graphics: 2,
  },
  tools: ["git", "ffmpeg"],
};
const claude: AgentProfile = {
  id: "claude-1",
  provider: "claude",
  available: true,
  capabilities: {
    typescript: 4, architecture: 4, code_review: 5,
    video_editing: 5, motion_graphics: 5,
    creative_direction: 5, subtitles: 5,
  },
  tools: ["git", "ffmpeg", "capcut_mcp"],
};

const pkg = buildCapCutWorkPackage({
  projectId: "project-1",
  channel: "instagram",
  aspectRatio: "9:16",
  targetDurationMs: 15000,
  hook: "An opening",
  clips: [{ assetId: "source-1", sourceStartMs: 0, sourceEndMs: 5000, order: 1, reason: "intro" }],
  captions: [],
  overlays: [],
  audio: [],
  coverBrief: null,
  diveMRevisionNotes: [],
  styleMemoryNotes: [],
});

describe("provider-neutral capability routing", () => {
  it("selects by task evidence, not a permanent provider role", () => {
    const forCode = routeAgentTask({
      id: "code", requiredCapabilities: ["typescript"],
      risk: "auto",
    }, [claude, codex]);
    expect(forCode.agentId).toBe("codex-1");

    const forVideo = routeAgentTask({
      id: "video", requiredCapabilities: ["video_editing"],
      preferredCapabilities: ["creative_direction"],
      requiredTools: ["ffmpeg"], risk: "auto",
    }, [claude, codex]);
    expect(forVideo.agentId).toBe("claude-1");
  });

  it("cannot pretend uninstalled CapCut tools are available", () => {
    const plan = planMediaEdit(pkg, [
      { ...claude, tools: ["git", "ffmpeg"] },
      codex,
    ], "capcut_draft");
    expect(plan.selection.status).toBe("blocked");
    expect(plan.publishAllowed).toBe(false);
    expect(plan.sourceReadOnly).toBe(true);
  });

  it("chooses an eligible editor without executing it", () => {
    const plan = planMediaEdit(pkg, [codex, claude], "capcut_draft");
    expect(plan.selection.agentId).toBe("claude-1");
    expect(plan.sourceAssetIds).toEqual(["source-1"]);
    expect(plan.requiresArtifactVerification).toBe(true);
  });

  it("requires independent review and honors unavailable providers", () => {
    const review = routeAgentTask({
      id: "review", requiredCapabilities: ["code_review"],
      independentOfAgentId: "codex-1", risk: "auto",
    }, [codex, claude]);
    expect(review.agentId).toBe("claude-1");
    const blocked = routeAgentTask({
      id: "review", requiredCapabilities: ["code_review"],
      independentOfAgentId: "codex-1", risk: "auto",
    }, [codex, { ...claude, available: false }]);
    expect(blocked.status).toBe("blocked");
  });

  it("does not assign approval-gated tasks without approval", () => {
    const result = routeAgentTask({
      id: "release", requiredCapabilities: ["typescript"],
      risk: "approval",
    }, [codex, claude]);
    expect(result.status).toBe("approval_required");
    expect(result.agentId).toBeNull();
  });

  it("blocks unknown capability scores instead of guessing", () => {
    const result = routeAgentTask({
      id: "video", requiredCapabilities: ["video_editing"],
      requiredTools: ["ffmpeg"], risk: "auto",
    }, [{ ...codex, capabilities: { typescript: 5 } }]);
    expect(result.status).toBe("blocked");
  });
});
