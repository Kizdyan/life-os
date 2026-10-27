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
  | "needs_revision";

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
        stage: "READY_FOR_SHOOT",
        statuses: {
          ...pipeline.statuses,
          QA: "completed",
          READY_FOR_SHOOT: "completed",
        },
        materials: { ...pipeline.materials, qa },
      };
    }
    case "QA":
    case "READY_FOR_SHOOT":
      return pipeline;
  }
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
