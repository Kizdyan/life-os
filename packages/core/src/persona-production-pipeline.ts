import {
  buildPersonaProductionBrief,
  type PersonaProductionBrief,
  type PersonaProductionBriefInput,
} from "./persona-production-brief";
import {
  evaluatePersonaProductionBrief,
  type PersonaProductionQaResult,
} from "./persona-production-qa";

export type PersonaProductionStage =
  | "IDEA"
  | "SCRIPT"
  | "SHOT_LIST"
  | "PRODUCTION_BRIEF"
  | "QA"
  | "READY_FOR_SHOOT";

export type PersonaProductionStageStatus =
  | "pending"
  | "completed"
  | "needs_revision"
  | "awaiting_editorial_review"
  | "requires_fact_review";

export interface PersonaEditorialDecision {
  decision: "approved" | "rejected";
  editor: string;
  comment: string;
  /** Required if QA found statements that require manual fact review. */
  factReviewCompleted?: boolean;
  decidedAt: string;
}

export interface PersonaProductionPipeline {
  stage: PersonaProductionStage;
  statuses: Record<PersonaProductionStage, PersonaProductionStageStatus>;
  input: PersonaProductionBriefInput;
  /** Facts the QA reviewer is permitted to approve, distinct from idea input. */
  qaAllowedFacts: string[];
  materials: {
    script?: PersonaProductionBrief["script"];
    shotList?: PersonaProductionBrief["shots"];
    productionBrief?: PersonaProductionBrief;
    qa?: PersonaProductionQaResult;
    editorialDecision?: PersonaEditorialDecision;
  };
}

export interface StartPersonaProductionPipelineInput extends PersonaProductionBriefInput {
  /** Omit to use the input's approved source facts. */
  qaAllowedFacts?: readonly string[];
}

/** Starts a stateful production record without deleting or overwriting any prior material. */
export function startPersonaProductionPipeline(
  input: StartPersonaProductionPipelineInput,
): PersonaProductionPipeline {
  return {
    stage: "IDEA",
    statuses: {
      IDEA: "completed",
      SCRIPT: "pending",
      SHOT_LIST: "pending",
      PRODUCTION_BRIEF: "pending",
      QA: "pending",
      READY_FOR_SHOOT: "pending",
    },
    input: {
      idea: { ...input.idea },
      sourceFacts: input.sourceFacts ? [...input.sourceFacts] : [],
    },
    qaAllowedFacts: [...(input.qaAllowedFacts ?? input.sourceFacts ?? [])],
    materials: {},
  };
}

/**
 * Advances exactly one stage. A QA failure stays at QA and keeps every
 * previously saved material available for an editor to revise.
 */
export function advancePersonaProductionPipeline(
  pipeline: PersonaProductionPipeline,
): PersonaProductionPipeline {
  switch (pipeline.stage) {
    case "IDEA": {
      const brief = buildPersonaProductionBrief(pipeline.input);
      return withStage(pipeline, "SCRIPT", {
        ...pipeline.materials,
        script: brief.script,
      });
    }
    case "SCRIPT": {
      const brief = buildPersonaProductionBrief(pipeline.input);
      return withStage(pipeline, "SHOT_LIST", {
        ...pipeline.materials,
        shotList: brief.shots,
      });
    }
    case "SHOT_LIST": {
      const brief = buildPersonaProductionBrief(pipeline.input);
      return withStage(pipeline, "PRODUCTION_BRIEF", {
        ...pipeline.materials,
        productionBrief: brief,
      });
    }
    case "PRODUCTION_BRIEF": {
      const brief = pipeline.materials.productionBrief;
      if (!brief) {
        throw new Error("Production brief is required before QA");
      }
      const qa = evaluatePersonaProductionBrief({
        brief,
        allowedFacts: pipeline.qaAllowedFacts,
      });
      if (qa.status === "needs_revision") {
        return {
          ...pipeline,
          stage: "QA",
          statuses: { ...pipeline.statuses, QA: "needs_revision" },
          materials: { ...pipeline.materials, qa },
        };
      }
      return {
        ...pipeline,
        stage: "QA",
        statuses: {
          ...pipeline.statuses,
          QA: qa.status === "requires_fact_review"
            ? "requires_fact_review"
            : "awaiting_editorial_review",
        },
        materials: { ...pipeline.materials, qa },
      };
    }
    case "QA":
    case "READY_FOR_SHOOT":
      return pipeline;
  }
}

/** Records a named human decision; only an approval can release a shoot-ready brief. */
export function recordPersonaEditorialDecision(
  pipeline: PersonaProductionPipeline,
  decision: PersonaEditorialDecision,
): PersonaProductionPipeline {
  if (pipeline.stage !== "QA" || !pipeline.materials.qa) {
    throw new Error("Editorial decision requires completed structural QA");
  }
  const normalized = normalizeEditorialDecision(decision);
  if (pipeline.materials.qa.status === "needs_revision" && normalized.decision === "approved") {
    throw new Error("A brief with failed structural QA cannot be approved");
  }
  if (
    normalized.decision === "approved" &&
    pipeline.materials.qa.factReview.status === "requires_fact_review" &&
    normalized.factReviewCompleted !== true
  ) {
    throw new Error("Fact review must be completed before approval");
  }
  if (normalized.decision === "rejected") {
    return {
      ...pipeline,
      stage: "QA",
      statuses: { ...pipeline.statuses, QA: "needs_revision" },
      materials: { ...pipeline.materials, editorialDecision: normalized },
    };
  }
  return {
    ...pipeline,
    stage: "READY_FOR_SHOOT",
    statuses: {
      ...pipeline.statuses,
      QA: "completed",
      READY_FOR_SHOOT: "completed",
    },
    materials: { ...pipeline.materials, editorialDecision: normalized },
  };
}

function withStage(
  pipeline: PersonaProductionPipeline,
  stage: "SCRIPT" | "SHOT_LIST" | "PRODUCTION_BRIEF",
  materials: PersonaProductionPipeline["materials"],
): PersonaProductionPipeline {
  return {
    ...pipeline,
    stage,
    statuses: { ...pipeline.statuses, [stage]: "completed" },
    materials,
  };
}

function normalizeEditorialDecision(
  decision: PersonaEditorialDecision,
): PersonaEditorialDecision {
  const editor = requireText(decision.editor, "editor");
  const comment = requireText(decision.comment, "comment");
  const decidedAt = requireText(decision.decidedAt, "decidedAt");
  return { ...decision, editor, comment, decidedAt };
}

function requireText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} must be a non-empty string`);
  return normalized;
}
