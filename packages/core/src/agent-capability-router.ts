/**
 * Provider-neutral capability routing. This module ONLY makes a selection;
 * executing a tool, granting approval and claiming completion happen elsewhere.
 */
export type AgentCapability =
  | "typescript"
  | "architecture"
  | "code_review"
  | "security_review"
  | "video_editing"
  | "motion_graphics"
  | "creative_direction"
  | "color_review"
  | "subtitles"
  | "photo_editing"
  | "audio_editing"
  | "composition"
  | "music_theory"
  | "score_engraving"
  | "research"
  | "fact_checking"
  | "technical_writing"
  | "creative_writing"
  | "strategy"
  | "marketing"
  | "analytics"
  | "financial_analysis"
  | "planning"
  | "scheduling"
  | "education"
  | "communication_coaching"
  | "automation"
  | "tool_evaluation"
  | "quality_assurance"
  | `custom:${string}`;

export type AgentDataClass = "public" | "internal" | "sensitive";

export type AgentProvider = "codex" | "claude" | "local" | "human" | "other";

export interface AgentProfile {
  id: string;
  provider: AgentProvider;
  available: boolean;
  /** Measured/calibrated capability, 0–5. Unknown = 0. */
  capabilities: Partial<Record<AgentCapability, number>>;
  /** Actual installed and verified tools, not aspirational integrations. */
  tools: readonly string[];
  /** Explicit permissions for task data. Defaults to public-only. */
  allowedDataClasses?: readonly AgentDataClass[];
  /** Optional nonnegative tie-breaker, in arbitrary relative units. */
  relativeCost?: number;
}

export interface AgentTask {
  id: string;
  /** Routes tasks from any product or personal workstream, not only video. */
  projectId?: string;
  /** Task data classification; omitted means public. */
  dataClass?: AgentDataClass;
  requiredCapabilities: readonly AgentCapability[];
  preferredCapabilities?: readonly AgentCapability[];
  requiredTools?: readonly string[];
  /** Exclude the author when selecting an independent reviewer. */
  independentOfAgentId?: string;
  risk: "auto" | "auto_report" | "approval";
  approved?: boolean;
}

export interface AgentSelection {
  status: "assigned" | "blocked" | "approval_required";
  agentId: string | null;
  provider: AgentProvider | null;
  reason: string;
  score: number | null;
}

const MIN_REQUIRED_CAPABILITY = 3;

function validRating(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) &&
    value >= 0 && value <= 5 ? value : 0;
}

export function routeAgentTask(
  task: AgentTask,
  agents: readonly AgentProfile[],
): AgentSelection {
  if (task.risk === "approval" && task.approved !== true) {
    return {
      status: "approval_required",
      agentId: null,
      provider: null,
      reason: "Explicit approval is required before this task may be assigned.",
      score: null,
    };
  }
  if (task.requiredCapabilities.length === 0) {
    return {
      status: "blocked", agentId: null, provider: null,
      reason: "No required capabilities specified; do not route blindly.",
      score: null,
    };
  }

  const tools = task.requiredTools ?? [];
  const eligible = agents.flatMap((agent) => {
    if (!agent.available || agent.id === task.independentOfAgentId) return [];
    if (!(agent.allowedDataClasses ?? ["public"]).includes(task.dataClass ?? "public")) return [];
    if (!tools.every((tool) => agent.tools.includes(tool))) return [];
    const ratings = task.requiredCapabilities.map(
      (capability) => validRating(agent.capabilities[capability]),
    );
    if (!ratings.every((rating) => rating >= MIN_REQUIRED_CAPABILITY)) return [];
    const preferred = (task.preferredCapabilities ?? []).reduce(
      (sum, capability) => sum + validRating(agent.capabilities[capability]), 0,
    );
    const relativeCost = agent.relativeCost ?? 0;
    if (!Number.isFinite(relativeCost) || relativeCost < 0) return [];
    return [{
      agent,
      score: ratings.reduce((sum, rating) => sum + rating * 10, 0) +
        preferred * 2 - relativeCost,
    }];
  });

  eligible.sort((a, b) =>
    b.score - a.score || a.agent.id.localeCompare(b.agent.id),
  );

  const selected = eligible[0];
  if (!selected) {
    return {
      status: "blocked", agentId: null, provider: null,
      reason: "No available agent satisfies the verified skills, tools and independence constraints.",
      score: null,
    };
  }
  return {
    status: "assigned",
    agentId: selected.agent.id,
    provider: selected.agent.provider,
    reason: "Selected from eligible agents by calibrated capabilities and relative cost.",
    score: selected.score,
  };
}
