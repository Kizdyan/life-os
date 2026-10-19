import type {
  DiveMContentAssessment,
  DiveMContentAssessmentRequest,
  DiveMStrategyService,
} from "./media-brain";

export interface DiveMStrategyTransport {
  assessContent(payload: {
    profile_id: string;
    project_id: string;
    asset_ids: string[];
    channel: "instagram" | "youtube" | "other";
    goal: string;
    current_focus: string[];
    proposed_hook: string | null;
    proposed_structure: string[];
    evidence: Record<string, number>;
  }): Promise<{
    fit: "strong" | "mixed" | "weak" | "unknown";
    notes: string[];
    weak_transition:
      | "visibility"
      | "contact"
      | "interest"
      | "opportunity"
      | "result"
      | null;
    revision_suggestions: string[];
    confidence: number;
    evidence_state: "sufficient" | "partial" | "insufficient";
  }>;
}

export interface VerifiedDiagnosticInput {
  tenantId: string;
  authorizedTenantId: string;
  measurements: Record<string, number>;
}

export interface VerifiedDiagnosticResult {
  state: "ACTIONABLE" | "UNKNOWN";
  score: number | null;
  components: Array<{
    name: string;
    value: number;
    evidenceState: "VERIFIED";
  }>;
  weakestComponent: string | null;
  recommendation: string | null;
}

/**
 * Produces a deliberately narrow diagnostic only from explicit, verified
 * tenant-scoped measurements. Missing measurements remain unknown instead of
 * being inferred from platform assumptions.
 */
export function diagnoseVerifiedMeasurements(
  input: VerifiedDiagnosticInput,
): VerifiedDiagnosticResult {
  if (input.tenantId !== input.authorizedTenantId) {
    throw new Error("tenant authorization mismatch");
  }

  const components = Object.entries(input.measurements).map(([name, value]) => {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error("measurement must be a finite value between 0 and 1");
    }
    return { name, value, evidenceState: "VERIFIED" as const };
  });

  if (components.length < 2) {
    return {
      state: "UNKNOWN",
      score: null,
      components,
      weakestComponent: null,
      recommendation: null,
    };
  }

  const weakestComponent = components.reduce((weakest, component) =>
    component.value < weakest.value ? component : weakest,
  );
  // Keep the user-visible score deterministic across IEEE-754 addition order.
  const score = Math.round(
    (components.reduce((total, component) => total + component.value, 0) / components.length) * 1_000_000,
  ) / 1_000_000;

  return {
    state: "ACTIONABLE",
    score,
    components,
    weakestComponent: weakestComponent.name,
    recommendation: `Improve ${weakestComponent.name} before changing other tactics.`,
  };
}

export class DiveMStrategyClient implements DiveMStrategyService {
  constructor(private readonly transport: DiveMStrategyTransport) {}

  async assessContent(
    input: DiveMContentAssessmentRequest,
  ): Promise<DiveMContentAssessment> {
    const payload = await this.transport.assessContent({
      profile_id: input.profileId,
      project_id: input.projectId,
      asset_ids: [...input.assetIds],
      channel: input.channel,
      goal: input.goal,
      current_focus: [...input.currentFocus],
      proposed_hook: input.proposedHook ?? null,
      proposed_structure: [...(input.proposedStructure ?? [])],
      evidence: { ...(input.evidence ?? {}) },
    });

    if (!Array.isArray(payload.notes)) {
      throw new Error("notes must be an array");
    }

    if (!payload.notes.every(note => typeof note === 'string')) {
      throw new Error("notes entries must be strings");
    }

    if (!Array.isArray(payload.revision_suggestions)) {
      throw new Error("revision_suggestions must be an array");
    }

    if (!payload.revision_suggestions.every(suggestion => typeof suggestion === 'string')) {
      throw new Error("revision_suggestions entries must be strings");
    }

    if (!Number.isFinite(payload.confidence) || payload.confidence < 0 || payload.confidence > 1) {
      throw new Error("DiveM assessment confidence must be between 0 and 1");
    }

    if (!['strong', 'mixed', 'weak', 'unknown'].includes(payload.fit)) {
      throw new Error("fit must be one of error");
    }

    if (payload.weak_transition !== null && !['visibility', 'contact', 'interest', 'opportunity', 'result'].includes(payload.weak_transition)) {
      throw new Error("weak_transition must be one of error");
    }

    if (!['sufficient', 'partial', 'insufficient'].includes(payload.evidence_state)) {
      throw new Error("evidence_state must be one of error");
    }

    return {
      fit: payload.fit,
      notes: [...payload.notes],
      weakTransition: payload.weak_transition,
      revisionSuggestions: [...payload.revision_suggestions],
      confidence: payload.confidence,
      evidenceState: payload.evidence_state,
    };
  }
}
