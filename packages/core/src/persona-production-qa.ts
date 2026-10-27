import type { PersonaProductionBrief } from "./persona-production-brief";

export type PersonaProductionQaStatus =
  | "pass"
  | "needs_revision"
  | "requires_fact_review";

export interface PersonaProductionStructuralCheck {
  id:
    | "script-completeness"
    | "shot-specificity"
    | "attention-logic"
    | "subtitle-readability"
    | "format-duration"
    | "fact-references"
    | "format-deliverable";
  passed: boolean;
  message: string;
}

export interface PersonaProductionQaResult {
  status: PersonaProductionQaStatus;
  structuralChecks: PersonaProductionStructuralCheck[];
  factReview: {
    status: "not_required" | "requires_fact_review";
    /** Fields with author- or model-supplied wording that structure cannot verify. */
    unverifiedFields: string[];
    message: string;
  };
  /**
   * These questions require a human editorial decision. They are deliberately
   * not collapsed into an automatic quality score.
   */
  editorialReview: {
    state: "pending";
    questions: string[];
  };
}

/**
 * Validates the objective contract of a production brief. It validates
 * structure and declared fact provenance only; it does not claim to measure
 * acting, taste, retention, or final video quality.
 */
export function evaluatePersonaProductionBrief(input: {
  brief: PersonaProductionBrief;
  allowedFacts: readonly string[];
}): PersonaProductionQaResult {
  const { brief } = input;
  const totalDurationSec = sumDurations(brief);
  const stillFormat = brief.formatPlan.kind === "photo_concept" || brief.formatPlan.kind === "carousel_cards";
  const timedFormat = !stillFormat;
  const unverifiedFields = collectUnverifiedFields(brief);
  const checks: PersonaProductionStructuralCheck[] = [
    {
      id: "script-completeness",
      passed:
        (stillFormat || brief.script.length > 0) &&
        (stillFormat || brief.script.every(
          (beat) =>
            isText(beat.line) && isText(beat.action) && isPositiveDuration(beat.durationSec),
        )),
      message: stillFormat ? "Для фото и карусели видео-шаблон запрещён; проверяется отдельный визуальный deliverable." : "Каждая сценарная часть должна иметь реплику, действие и положительную длительность.",
    },
    {
      id: "shot-specificity",
      passed:
        (stillFormat || brief.shots.length > 0) &&
        (stillFormat || brief.shots.every(
          (shot) =>
            isPositiveDuration(shot.durationSec) &&
            isText(shot.angle) &&
            isText(shot.cameraMovement) &&
            isText(shot.lighting) &&
            isText(shot.action),
        )),
      message: "Каждый кадр должен содержать длительность, ракурс, движение камеры, свет и действие.",
    },
    {
      id: "attention-logic",
      passed:
        (stillFormat || (brief.script.length > 0 &&
        brief.script[0].line === brief.hook.firstSeconds &&
        brief.script[0].durationSec > 0)) &&
        (stillFormat || isText(brief.script[brief.script.length - 1]?.line ?? "")),
      message: "Хук должен быть первой короткой репликой, а финальная мысль — завершённой.",
    },
    {
      id: "subtitle-readability",
      passed:
        brief.postProduction.subtitles.maxCharactersPerLine > 0 &&
        brief.postProduction.subtitles.maxCharactersPerLine <= 42 &&
        isText(brief.postProduction.subtitles.instruction),
      message: "Субтитры должны иметь понятную инструкцию и не превышать 42 символа в строке.",
    },
    {
      id: "format-duration",
      passed:
        (timedFormat ? totalDurationSec > 0 : totalDurationSec === 0) &&
        Object.values(brief.adaptations).every(
          (adaptation) =>
            (adaptation.aspectRatio === "9:16" || adaptation.aspectRatio === "4:5") &&
            adaptation.durationSec === totalDurationSec &&
            isText(adaptation.instruction),
        ),
      message: "Платформенные адаптации должны соответствовать длительности съёмочного плана и вертикальному формату.",
    },
    {
      id: "format-deliverable",
      passed: hasCompleteFormatPlan(brief),
      message: "Выбранный формат должен иметь собственный законченный deliverable: сцены, карточки, фотоконцепцию или кадры Stories.",
    },
    {
      id: "fact-references",
      passed: brief.factReferences.every((fact) => input.allowedFacts.includes(fact)),
      message: "Каждая фактическая ссылка должна быть в утверждённом наборе фактов автора.",
    },
  ];

  const structuralPass = checks.every((check) => check.passed);
  return {
    status: !structuralPass
      ? "needs_revision"
      : unverifiedFields.length > 0
        ? "requires_fact_review"
        : "pass",
    structuralChecks: checks,
    factReview: {
      status: unverifiedFields.length > 0 ? "requires_fact_review" : "not_required",
      unverifiedFields,
      message: unverifiedFields.length > 0
        ? "Структурная проверка не доказывает отсутствие выдуманных фактов в этих авторских утверждениях; нужна ручная сверка источников."
        : "Свободных фактических утверждений, требующих отдельной сверки, не обнаружено.",
    },
    editorialReview: {
      state: "pending",
      questions: [
        "Сохраняет ли материал индивидуальность автора?",
        "Удерживает ли драматургия внимание без кликбейта?",
        "Естественны ли предполагаемые паузы, интонация и монтажный ритм?",
        "Соответствует ли визуальная и цветовая подача авторскому образу?",
      ],
    },
  };
}

function hasCompleteFormatPlan(brief: PersonaProductionBrief): boolean {
  switch (brief.formatPlan.kind) {
    case "vertical_video":
      return isPositiveDuration(brief.formatPlan.targetDurationSec) && isText(brief.formatPlan.pacing) && isText(brief.formatPlan.ending);
    case "acting_sketch":
      return brief.formatPlan.characters.length >= 2 &&
        brief.formatPlan.characters.every((character) => isText(character.name) && isText(character.objective)) &&
        isText(brief.formatPlan.conflict) && isText(brief.formatPlan.comicTurn) && isText(brief.formatPlan.ending);
    case "carousel_cards":
      return brief.formatPlan.cards.length >= 3 && brief.formatPlan.cards.every((card) =>
        Number.isInteger(card.order) && card.order > 0 && isText(card.heading) && isText(card.body) && isText(card.visualDirection),
      );
    case "photo_concept":
      return isText(brief.formatPlan.composition) && isText(brief.formatPlan.subjectAction) && isText(brief.formatPlan.lighting) && isText(brief.formatPlan.colorTreatment);
    case "story_sequence":
      return brief.formatPlan.frames.length >= 2 && brief.formatPlan.frames.every((frame) =>
        Number.isInteger(frame.order) && frame.order > 0 && isPositiveDuration(frame.durationSec) && isText(frame.visual) && isText(frame.text),
      );
  }
}

function collectUnverifiedFields(brief: PersonaProductionBrief): string[] {
  const fields: string[] = [];
  if (isText(brief.hook.firstSeconds)) fields.push("hook.firstSeconds");
  for (const [index, beat] of brief.script.entries()) {
    if (isText(beat.line) && beat.line !== "Сохраните эту мысль и попробуйте применить её в своей практике.") {
      fields.push(`script[${index}].line`);
    }
  }
  return fields;
}

function sumDurations(brief: PersonaProductionBrief): number {
  return brief.shots.reduce((total, shot) => total + shot.durationSec, 0);
}

function isPositiveDuration(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isText(value: string): boolean {
  return value.trim().length > 0;
}
