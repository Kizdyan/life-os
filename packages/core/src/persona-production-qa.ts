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
    | "fact-references";
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
  const unverifiedFields = collectUnverifiedFields(brief);
  const checks: PersonaProductionStructuralCheck[] = [
    {
      id: "script-completeness",
      passed:
        brief.script.length > 0 &&
        brief.script.every(
          (beat) =>
            isText(beat.line) && isText(beat.action) && isPositiveDuration(beat.durationSec),
        ),
      message: "Каждая сценарная часть должна иметь реплику, действие и положительную длительность.",
    },
    {
      id: "shot-specificity",
      passed:
        brief.shots.length > 0 &&
        brief.shots.every(
          (shot) =>
            isPositiveDuration(shot.durationSec) &&
            isText(shot.angle) &&
            isText(shot.cameraMovement) &&
            isText(shot.lighting) &&
            isText(shot.action),
        ),
      message: "Каждый кадр должен содержать длительность, ракурс, движение камеры, свет и действие.",
    },
    {
      id: "attention-logic",
      passed:
        brief.script.length > 0 &&
        brief.script[0].line === brief.hook.firstSeconds &&
        brief.script[0].durationSec <= 5 &&
        isText(brief.script[brief.script.length - 1]?.line ?? ""),
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
        totalDurationSec > 0 &&
        Object.values(brief.adaptations).every(
          (adaptation) =>
            adaptation.aspectRatio === "9:16" &&
            adaptation.durationSec === totalDurationSec &&
            isText(adaptation.instruction),
        ),
      message: "Платформенные адаптации должны соответствовать длительности съёмочного плана и вертикальному формату.",
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
