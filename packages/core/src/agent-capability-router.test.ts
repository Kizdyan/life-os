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


describe("cross-product capacity routing", () => {
  // Scores are synthetic TEST FIXTURES, not claims about real Codex/Claude ability.
  const agents: AgentProfile[] = [
    {
      id: "code-agent",
      provider: "codex",
      available: true,
      capabilities: {
        typescript: 5, architecture: 5, analytics: 4,
        quality_assurance: 4, research: 3,
      },
      tools: ["git", "test_runner"],
      allowedDataClasses: ["public", "internal"],
    },
    {
      id: "creative-agent",
      provider: "claude",
      available: true,
      capabilities: {
        creative_writing: 5, composition: 4, marketing: 5,
        strategy: 5, technical_writing: 4, research: 4,
        education: 4, quality_assurance: 5,
      },
      tools: ["git", "document_editor"],
      allowedDataClasses: ["public", "internal"],
    },
    {
      id: "planning-agent",
      provider: "local",
      available: true,
      capabilities: {
        financial_analysis: 4, scheduling: 5,
        planning: 5, analytics: 4, research: 3,
      },
      tools: ["calculator", "calendar"],
      allowedDataClasses: ["public", "internal", "sensitive"],
    },
  ];

  it("routes software, writing, music, scheduling and analytics with the same function", () => {
    const examples = [
      { projectId: "life-os", kind: "typescript", expected: "code-agent" },
      { projectId: "musical", kind: "composition", expected: "creative-agent" },
      { projectId: "career", kind: "marketing", expected: "creative-agent" },
      { projectId: "everyday", kind: "scheduling", expected: "planning-agent" },
      { projectId: "dive-m", kind: "analytics", expected: "code-agent" },
    ] as const;
    for (const example of examples) {
      const result = routeAgentTask({
        id: example.projectId + ":" + example.kind,
        projectId: example.projectId,
        requiredCapabilities: [example.kind],
        dataClass: "public",
        risk: "auto",
      }, agents);
      expect(result.agentId).toBe(example.expected);
    }
  });

  it("blocks access to sensitive records without explicit provider permission", () => {
    const onlyCreative = routeAgentTask({
      id: "private-notes",
      projectId: "personal",
      requiredCapabilities: ["research"],
      dataClass: "sensitive",
      risk: "auto",
    }, [agents[1]]);
    expect(onlyCreative.status).toBe("blocked");

    const eligible = routeAgentTask({
      id: "private-finance",
      projectId: "finance",
      requiredCapabilities: ["financial_analysis"],
      dataClass: "sensitive",
      risk: "auto",
    }, agents);
    expect(eligible.agentId).toBe("planning-agent");
  });

  it("keeps consequential actions approval-gated across workstreams", () => {
    const scheduled = routeAgentTask({
      id: "schedule",
      projectId: "everyday",
      requiredCapabilities: ["scheduling"],
      dataClass: "sensitive",
      risk: "approval",
    }, agents);
    expect(scheduled.status).toBe("approval_required");

    const finance = routeAgentTask({
      id: "financial-transfer",
      projectId: "finance",
      requiredCapabilities: ["financial_analysis"],
      dataClass: "sensitive",
      risk: "approval",
    }, agents);
    expect(finance.status).toBe("approval_required");
  });

  it("allows a new domain capability without a per-project fork", () => {
    const result = routeAgentTask({
      id: "new-workstream",
      projectId: "future-project",
      requiredCapabilities: ["custom:3d-modelling"],
      risk: "auto",
    }, [{
      ...agents[0],
      capabilities: { "custom:3d-modelling": 5 },
    }]);
    expect(result.agentId).toBe("code-agent");
  });
});
