/**
 * Seed directory for manual research only.
 * Sources are verified repository locations, NOT audited skill releases.
 * Null commit/digest deliberately prevents admission.
 */
import type { SkillDirectoryRecord } from "./skill-intelligence";

export const SKILL_DIRECTORY_SEED: readonly SkillDirectoryRecord[] = [
  {
    id: "remotion-best-practices", title: "Remotion Best Practices",
    description: "Remotion video compositions, animation, editing workflow and rendering",
    sourceUrl: "https://github.com/remotion-dev/remotion",
    sourceRevision: null, skillPath: "packages/skills/skills/remotion-best-practices",
    manifestSha256: null, domains: ["video", "design"],
    supportedAgents: ["claude-code", "codex", "cursor"],
    advertisedTools: ["remotion"], requestedPermissions: [], license: null,
  },
  {
    id: "find-skills", title: "Find Skills",
    description: "Discover skills and research agent capabilities in the open skills ecosystem",
    sourceUrl: "https://github.com/vercel-labs/skills",
    sourceRevision: null, skillPath: "skills/find-skills",
    manifestSha256: null, domains: ["engineering", "research", "operations"],
    supportedAgents: ["claude-code", "codex", "cursor", "opencode"],
    advertisedTools: [], requestedPermissions: [], license: "MIT",
  },
] as const;
