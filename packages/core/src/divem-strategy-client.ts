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
