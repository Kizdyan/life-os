import {
  buildPersonaProductionBrief,
  type PersonaProductionBrief,
  type PersonaProductionBriefInput,
  type PersonaProductionIdea,
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

/**
 * Validates an external, editor-authored brief before it can replace the
 * current plan. Import enters QA; it can never carry editorial approval in
 * from a JSON file.
 */
export function importPersonaProductionBrief(input: {
  brief: unknown;
  selectedIdea?: PersonaProductionIdea;
}): PersonaProductionPipeline {
  const parsed = parsePersonaProductionBrief(input.brief);
  const idea = input.selectedIdea
    ? bindBriefToSelectedIdea(parsed, input.selectedIdea)
    : {
        id: parsed.ideaId,
        title: parsed.sourceTitle,
        angle: parsed.sourceAngle,
        format: parsed.sourceFormat,
      };
  const brief = input.selectedIdea ? { ...parsed, ideaId: idea.id } : parsed;
  return pipelineFromBrief(brief, idea);
}

/** Re-runs structural QA and clears any prior editorial decision after an edit. */
export function revisePersonaProductionBrief(
  pipeline: PersonaProductionPipeline,
  brief: unknown,
): PersonaProductionPipeline {
  const parsed = parsePersonaProductionBrief(brief);
  const idea = pipeline.input.idea;
  if (
    parsed.ideaId !== idea.id ||
    parsed.sourceTitle !== idea.title ||
    parsed.sourceAngle !== idea.angle ||
    parsed.sourceFormat !== idea.format
  ) {
    throw new Error("Edited brief must remain bound to the selected idea");
  }
  return pipelineFromBrief(parsed, idea, pipeline.qaAllowedFacts);
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
  if (normalized.decision === "approved" && (pipeline.input.idea.angle.trim() !== pipeline.materials.productionBrief?.sourceAngle ||
      pipeline.input.idea.title.trim() !== pipeline.materials.productionBrief?.sourceTitle ||
      pipeline.input.idea.format !== pipeline.materials.productionBrief?.sourceFormat)) {
    throw new Error("The idea changed after the brief was generated; rebuild and rerun QA");
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

function pipelineFromBrief(
  brief: PersonaProductionBrief,
  idea: PersonaProductionIdea,
  allowedFacts: readonly string[] = brief.factReferences,
): PersonaProductionPipeline {
  const qaAllowedFacts = [...allowedFacts];
  const qa = evaluatePersonaProductionBrief({ brief, allowedFacts: qaAllowedFacts });
  return {
    stage: "QA",
    statuses: {
      IDEA: "completed",
      SCRIPT: "completed",
      SHOT_LIST: "completed",
      PRODUCTION_BRIEF: "completed",
      QA: qa.status === "needs_revision"
        ? "needs_revision"
        : qa.status === "requires_fact_review"
          ? "requires_fact_review"
          : "awaiting_editorial_review",
      READY_FOR_SHOOT: "pending",
    },
    input: { idea: { ...idea }, sourceFacts: [...brief.factReferences] },
    qaAllowedFacts,
    materials: {
      script: brief.script,
      shotList: brief.shots,
      productionBrief: brief,
      qa,
    },
  };
}

function bindBriefToSelectedIdea(
  brief: PersonaProductionBrief,
  idea: PersonaProductionIdea,
): PersonaProductionIdea {
  const selected = normalizeImportedIdea(idea);
  if (
    brief.sourceTitle !== selected.title ||
    brief.sourceAngle !== selected.angle ||
    brief.sourceFormat !== selected.format
  ) {
    throw new Error("Imported brief does not match the selected idea");
  }
  return selected;
}

function normalizeImportedIdea(idea: PersonaProductionIdea): PersonaProductionIdea {
  return {
    id: text(idea.id, "selected idea.id"),
    title: text(idea.title, "selected idea.title"),
    angle: text(idea.angle, "selected idea.angle"),
    format: personaFormat(idea.format, "selected idea.format"),
  };
}

function parsePersonaProductionBrief(value: unknown): PersonaProductionBrief {
  const record = asRecord(value, "brief");
  const sourceFormat = personaFormat(record.sourceFormat, "sourceFormat");
  const script = array(record.script, "script").map((entry, index) => {
    const beat = asRecord(entry, `script[${index}]`);
    return {
      order: positiveInteger(beat.order, `script[${index}].order`),
      durationSec: positiveNumber(beat.durationSec, `script[${index}].durationSec`),
      line: text(beat.line, `script[${index}].line`),
      action: text(beat.action, `script[${index}].action`),
    };
  });
  const shots: PersonaProductionBrief["shots"] = array(record.shots, "shots").map((entry, index): PersonaProductionBrief["shots"][number] => {
    const shot = asRecord(entry, `shots[${index}]`);
    const framing = shot.framing;
    if (framing !== "close-up" && framing !== "medium" && framing !== "detail") {
      throw new Error(`shots[${index}].framing is invalid`);
    }
    return {
      order: positiveInteger(shot.order, `shots[${index}].order`),
      durationSec: positiveNumber(shot.durationSec, `shots[${index}].durationSec`),
      framing,
      angle: text(shot.angle, `shots[${index}].angle`),
      cameraMovement: text(shot.cameraMovement, `shots[${index}].cameraMovement`),
      lighting: text(shot.lighting, `shots[${index}].lighting`),
      action: text(shot.action, `shots[${index}].action`),
    };
  });
  const capture = asRecord(record.capture, "capture");
  const audio = asRecord(capture.audio, "capture.audio");
  const postProduction = asRecord(record.postProduction, "postProduction");
  const subtitles = asRecord(postProduction.subtitles, "postProduction.subtitles");
  const adaptationsRecord = asRecord(record.adaptations, "adaptations");
  const adaptations = {
    reels: adaptation(adaptationsRecord.reels, "adaptations.reels"),
    shorts: adaptation(adaptationsRecord.shorts, "adaptations.shorts"),
    vkClips: adaptation(adaptationsRecord.vkClips, "adaptations.vkClips"),
  };
  const brief: PersonaProductionBrief = {
    version: versionOne(record.version),
    ideaId: text(record.ideaId, "ideaId"),
    sourceAngle: text(record.sourceAngle, "sourceAngle"),
    sourceTitle: text(record.sourceTitle, "sourceTitle"),
    sourceFormat,
    hook: hook(record.hook),
    script,
    shots,
    capture: {
      props: array(capture.props, "capture.props").map((item, index) => text(item, `capture.props[${index}]`)),
      wardrobe: text(capture.wardrobe, "capture.wardrobe"),
      location: text(capture.location, "capture.location"),
      lighting: text(capture.lighting, "capture.lighting"),
      audio: {
        recording: text(audio.recording, "capture.audio.recording"),
        processing: text(audio.processing, "capture.audio.processing"),
      },
    },
    postProduction: {
      transitions: text(postProduction.transitions, "postProduction.transitions"),
      subtitles: {
        instruction: text(subtitles.instruction, "postProduction.subtitles.instruction"),
        maxCharactersPerLine: positiveInteger(subtitles.maxCharactersPerLine, "postProduction.subtitles.maxCharactersPerLine"),
      },
      color: text(postProduction.color, "postProduction.color"),
    },
    adaptations,
    factReferences: array(record.factReferences, "factReferences").map((item, index) => text(item, `factReferences[${index}]`)),
  };
  assertTimelineConsistency(brief);
  return brief;
}

function assertTimelineConsistency(brief: PersonaProductionBrief): void {
  if (brief.sourceFormat === "photo" || brief.sourceFormat === "carousel") return;
  if (!brief.script.length || brief.script.length !== brief.shots.length) {
    throw new Error("Imported brief must have matching script and shot counts");
  }
  const total = brief.shots.reduce((sum, shot, index) => {
    const beat = brief.script[index];
    if (beat.order !== index + 1 || shot.order !== index + 1 || beat.durationSec !== shot.durationSec) {
      throw new Error("Imported brief script and shots must have matching order and durations");
    }
    return sum + shot.durationSec;
  }, 0);
  for (const adaptation of Object.values(brief.adaptations)) {
    if (adaptation.aspectRatio !== "9:16" || adaptation.durationSec !== total) {
      throw new Error("Imported brief adaptations must match the shot duration and 9:16 format");
    }
  }
}

function asRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object`);
  return value as Record<string, unknown>;
}
function array(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array`);
  return value;
}
function text(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must be a non-empty string`);
  return value.trim();
}
function positiveNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number`);
  return value;
}
function positiveInteger(value: unknown, name: string): number {
  if (!Number.isInteger(value) || typeof value !== "number" || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}
function versionOne(value: unknown): 1 {
  if (value !== 1) throw new Error("version must be 1");
  return 1;
}
function personaFormat(value: unknown, name: string): PersonaProductionIdea["format"] {
  if (value !== "carousel" && value !== "photo" && value !== "reel" && value !== "short" && value !== "story") {
    throw new Error(`${name} is invalid`);
  }
  return value;
}
function hook(value: unknown): PersonaProductionBrief["hook"] {
  const record = asRecord(value, "hook");
  return {
    firstSeconds: text(record.firstSeconds, "hook.firstSeconds"),
    visual: text(record.visual, "hook.visual"),
    delivery: text(record.delivery, "hook.delivery"),
  };
}
function adaptation(value: unknown, name: string): PersonaProductionBrief["adaptations"]["reels"] {
  const record = asRecord(value, name);
  if (record.aspectRatio !== "9:16") throw new Error(`${name}.aspectRatio must be 9:16`);
  return { aspectRatio: "9:16", durationSec: positiveNumber(record.durationSec, `${name}.durationSec`), instruction: text(record.instruction, `${name}.instruction`) };
}

function requireText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} must be a non-empty string`);
  return normalized;
}
