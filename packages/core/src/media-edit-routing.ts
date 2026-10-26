import type { CapCutWorkPackage } from "./capcut-work-package";
import {
  routeAgentTask,
  type AgentProfile,
  type AgentSelection,
} from "./agent-capability-router";

export type MediaEditMode = "capcut_draft" | "ffmpeg_render";

/**
 * This is a SAFE planning boundary, not a CapCut or FFmpeg connection.
 * Any actual adapter must verify output artifacts before claiming completion.
 */
export interface MediaEditRoutingPlan {
  mode: MediaEditMode;
  selection: AgentSelection;
  sourceAssetIds: string[];
  requiredTool: string;
  sourceReadOnly: true;
  publishAllowed: false;
  requiresArtifactVerification: true;
}

export function planMediaEdit(
  workPackage: CapCutWorkPackage,
  agents: readonly AgentProfile[],
  mode: MediaEditMode,
): MediaEditRoutingPlan {
  const requiredTool = mode === "capcut_draft" ? "capcut_mcp" : "ffmpeg";
  const selection: AgentSelection = workPackage.clips.length === 0
    ? {
      status: "blocked",
      agentId: null,
      provider: null,
      reason: "The work package has no source clips.",
      score: null,
    }
    : routeAgentTask({
      id: `prepare_edit:${workPackage.projectId}`,
      requiredCapabilities: ["video_editing"],
      preferredCapabilities: mode === "capcut_draft"
        ? ["creative_direction", "subtitles"]
        : ["motion_graphics", "color_review"],
      requiredTools: [requiredTool],
      risk: "auto",
    }, agents);

  return {
    mode,
    selection,
    sourceAssetIds: [...new Set(workPackage.clips.map((clip) => clip.assetId))],
    requiredTool,
    sourceReadOnly: true,
    publishAllowed: false,
    requiresArtifactVerification: true,
  };
}
