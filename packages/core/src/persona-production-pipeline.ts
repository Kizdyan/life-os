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
  /** Rejects a decision copied from an older brief revision. */
  expectedRevision?: number;
  decidedAt: string;
}

export type PersonaProductionRevisionEvent =
  | "created"
  | "qa_checked"
  | "editorial_approved"
  | "editorial_rejected"
  | "revised";

export interface PersonaProductionRevisionRecord {
  revision: number;
  event: PersonaProductionRevisionEvent;
  stage: PersonaProductionStage;
  detail: string;
}

export interface PersonaArchivedProductionRevision {
  revision: number;
  reason: string;
  stage: PersonaProductionStage;
  input: PersonaProductionBriefInput;
  materials: PersonaProductionPipeline["materials"];
}

export interface PersonaProductionPipeline {
  /** Incremented for every author edit that invalidates a reviewed brief. */
  revision: number;
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
  /** Prior materials remain auditable after a revision; nothing is discarded. */
  archivedRevisions: PersonaArchivedProductionRevision[];
  revisionHistory: PersonaProductionRevisionRecord[];
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
    revision: 1,
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
    archivedRevisions: [],
    revisionHistory: [{ revision: 1, event: "created", stage: "IDEA", detail: "Draft created" }],
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
          revisionHistory: addRevisionEvent(pipeline, "qa_checked", "QA found structural issues"),
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
        revisionHistory: addRevisionEvent(pipeline, "qa_checked", "QA completed"),
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
  const revision = currentRevision(pipeline);
  if (
    normalized.expectedRevision !== undefined &&
    normalized.expectedRevision !== revision
  ) {
    throw new Error("Editorial decision belongs to a different revision");
  }
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
      revisionHistory: addRevisionEvent(pipeline, "editorial_rejected", normalized.comment),
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
    revisionHistory: addRevisionEvent(pipeline, "editorial_approved", normalized.comment),
  };
}

/**
 * Starts a fresh, auditable revision after an author edit. It intentionally
 * clears the current derived materials so a prior QA or approval can never
 * be inherited by a new wording, while retaining that material in history.
 */
export function revisePersonaProductionPipeline(
  pipeline: PersonaProductionPipeline,
  input: { angle: string; reason: string },
): PersonaProductionPipeline {
  const angle = requireText(input.angle, "angle");
  const reason = requireText(input.reason, "reason");
  const priorRevision = currentRevision(pipeline);
  const revision = priorRevision + 1;
  const priorInput: PersonaProductionBriefInput = {
    idea: { ...pipeline.input.idea },
    sourceFacts: [...(pipeline.input.sourceFacts ?? [])],
  };
  return {
    ...pipeline,
    revision,
    stage: "IDEA",
    statuses: initialStatuses(),
    input: {
      ...priorInput,
      idea: { ...priorInput.idea, angle },
    },
    materials: {},
    archivedRevisions: [
      ...(pipeline.archivedRevisions ?? []),
      {
        revision: priorRevision,
        reason,
        stage: pipeline.stage,
        input: priorInput,
        materials: { ...pipeline.materials },
      },
    ],
    revisionHistory: [
      ...(pipeline.revisionHistory ?? []),
      { revision, event: "revised", stage: "IDEA", detail: reason },
    ],
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

function initialStatuses(): Record<PersonaProductionStage, PersonaProductionStageStatus> {
  return {
    IDEA: "completed",
    SCRIPT: "pending",
    SHOT_LIST: "pending",
    PRODUCTION_BRIEF: "pending",
    QA: "pending",
    READY_FOR_SHOOT: "pending",
  };
}

function currentRevision(pipeline: PersonaProductionPipeline): number {
  return Number.isInteger(pipeline.revision) && pipeline.revision > 0 ? pipeline.revision : 1;
}

function addRevisionEvent(
  pipeline: PersonaProductionPipeline,
  event: Exclude<PersonaProductionRevisionEvent, "created" | "revised">,
  detail: string,
): PersonaProductionRevisionRecord[] {
  return [
    ...(pipeline.revisionHistory ?? []),
    { revision: currentRevision(pipeline), event, stage: pipeline.stage, detail },
  ];
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
