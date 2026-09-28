import type { ActionRequest, PolicyDecision } from "./types";

const APPROVAL_RISKS = new Set(["financial", "destructive", "security", "production"]);

export function decideAutonomy(action: ActionRequest): PolicyDecision {
  const blocking = action.risks.filter((risk) => APPROVAL_RISKS.has(risk));
  if (blocking.length) {
    return { level: "approval", reasons: blocking.map((r) => `risk:${r}`) };
  }

  if (action.risks.includes("external")) {
    return {
      level: "auto_report",
      reasons: ["bounded external side effect; verify and report"],
    };
  }

  return {
    level: "auto",
    reasons: [action.reversible ? "safe/reversible" : "read-only or bounded"],
  };
}
