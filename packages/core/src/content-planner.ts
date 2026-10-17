import type { DiveMContentAssessment } from "./media-brain";
import type { ContentCandidate } from "./media-pipeline";
import type {
  ContentPlanner,
  PlannedContentDraft,
} from "./content-factory";

export interface StructuredAiClient {
  completeJson(input: {
    system: string;
    user: string;
    schemaName: string;
  }): Promise<unknown>;
}

export class StructuredContentPlanner implements ContentPlanner {
  constructor(private readonly ai: StructuredAiClient) {}

  async createPlan(input: {
    projectId: string;
    assetIds: string[];
    channel: "instagram" | "youtube" | "other";
    goal: string;
    styleMemoryNotes: string[];
    formatMemoryNotes?: string[];
    lifeOsContext: Record<string, unknown> | null;
  }): Promise<PlannedContentDraft> {
    const raw = await this.ai.completeJson({
      schemaName: "media_content_plan_v1",
      system: BASE_SYSTEM_PROMPT,
      user: JSON.stringify(
        {
          task: "create_draft",
          project_id: input.projectId,
          allowed_asset_ids: input.assetIds,
          channel: input.channel,
          goal: input.goal,
          style_memory: input.styleMemoryNotes,
          format_memory: input.formatMemoryNotes ?? [],
          life_os_context: input.lifeOsContext,
        },
        null,
        2,
      ),
    });

    return parsePlan(raw);
  }

  async revisePlan(input: {
    candidate: ContentCandidate;
    assessment: DiveMContentAssessment;
  }): Promise<PlannedContentDraft> {
    const raw = await this.ai.completeJson({
      schemaName: "media_content_revision_v1",
      system: BASE_SYSTEM_PROMPT,
      user: JSON.stringify(
        {
          task: "revise_draft",
          allowed_asset_ids: input.candidate.assetIds,
          current: input.candidate.workPackage,
          dive_m_assessment: input.assessment,
        },
        null,
        2,
      ),
    });

    return parsePlan(raw);
  }
}

const BASE_SYSTEM_PROMPT = [
  "Ты планировщик контента личной Media Brain.",
  "Возвращай только структурированный JSON для монтажного плана.",
  "Не выдумывай исходники, людей, события или фрагменты, которых нет среди allowed_asset_ids.",
  "Не превращай личную жизнь в обязательный контент: Life OS context — только дополнительный контекст.",
  "Соблюдай Style Memory, но не копируй референсы буквально.",
  "Format Memory описывает механику подачи, а не истинность тезисов референса.",
  "Не переноси спорные или непроверенные утверждения из референсов в фактические тезисы.",
  "DiveM-рекомендации используются как гипотезы стратегии, а не как гарантия вирусности.",
  "Избегай дешёвого кликбейта, если он противоречит Style Memory.",
  "План должен быть пригоден для последующей сборки в CapCut.",
].join("\n");

function parsePlan(raw: unknown): PlannedContentDraft {
  if (!isRecord(raw)) throw new Error("Content planner returned non-object JSON");

  const clipsRaw = requireArray(raw.clips, "clips");
  const captionsRaw = requireArray(raw.captions, "captions");
  const overlaysRaw = requireArray(raw.overlays, "overlays");
  const audioRaw = requireArray(raw.audio, "audio");
  const editorNotesRaw = requireArray(raw.editorNotes ?? raw.editor_notes ?? [], "editorNotes");

  const aspectRatio = raw.aspectRatio ?? raw.aspect_ratio;
  if (!["9:16", "16:9", "1:1", "4:5"].includes(String(aspectRatio))) {
    throw new Error("Content planner returned invalid aspect ratio");
  }
  const targetDurationMs = nullableNumber(
    raw.targetDurationMs ?? raw.target_duration_ms,
    "targetDurationMs",
  );
  if (targetDurationMs !== null && targetDurationMs <= 0) {
    throw new Error("Content planner target duration must be positive");
  }

  return {
    title: nullableString(raw.title),
    caption: nullableString(raw.caption),
    aspectRatio: aspectRatio as PlannedContentDraft["aspectRatio"],
    targetDurationMs,
    hook: nullableString(raw.hook),
    clips: clipsRaw.map((item, index) => {
      const value = requireRecord(item, `clips[${index}]`);
      const sourceStartMs = requireNumber(
        value.sourceStartMs ?? value.source_start_ms,
        "sourceStartMs",
      );
      const sourceEndMs = requireNumber(
        value.sourceEndMs ?? value.source_end_ms,
        "sourceEndMs",
      );
      if (sourceStartMs < 0 || sourceEndMs <= sourceStartMs) {
        throw new Error(`Content planner clips[${index}] has invalid temporal range`);
      }
      return {
        assetId: requireString(value.assetId ?? value.asset_id, "assetId"),
        sourceStartMs,
        sourceEndMs,
        order: requireNumber(value.order, "order"),
        reason: requireString(value.reason, "reason"),
      };
    }),
    captions: captionsRaw.map((item, index) => {
      const value = requireRecord(item, `captions[${index}]`);
      const startMs = requireNumber(value.startMs ?? value.start_ms, "startMs");
      const endMs = requireNumber(value.endMs ?? value.end_ms, "endMs");
      if (startMs < 0 || endMs <= startMs) {
        throw new Error(`Content planner captions[${index}] has invalid temporal range`);
      }
      return {
        startMs,
        endMs,
        text: requireString(value.text, "text"),
      };
    }),
    overlays: overlaysRaw.map((item, index) => {
      const value = requireRecord(item, `overlays[${index}]`);
      const role = requireString(value.role, "role");
      if (!["hook", "context", "cta", "label"].includes(role)) {
        throw new Error("Content planner returned invalid overlay role");
      }
      const atMs = requireNumber(value.atMs ?? value.at_ms, "atMs");
      const durationMs = requireNumber(
        value.durationMs ?? value.duration_ms,
        "durationMs",
      );
      if (atMs < 0 || durationMs <= 0) {
        throw new Error(`Content planner overlays[${index}] has invalid duration or range`);
      }
      return {
        atMs,
        durationMs,
        text: requireString(value.text, "text"),
        role: role as "hook" | "context" | "cta" | "label",
      };
    }),
    audio: audioRaw.map((item, index) => {
      const value = requireRecord(item, `audio[${index}]`);
      const kind = requireString(value.kind, "kind");
      if (!["music", "voice", "ambient", "effect"].includes(kind)) {
        throw new Error("Content planner returned invalid audio kind");
      }
      return {
        atMs: requireNumber(value.atMs ?? value.at_ms, "atMs"),
        kind: kind as "music" | "voice" | "ambient" | "effect",
        instruction: requireString(value.instruction, "instruction"),
      };
    }),
    coverBrief: nullableString(raw.coverBrief ?? raw.cover_brief),
    editorNotes: editorNotesRaw.map((item) =>
      requireString(item, "editorNotes[]"),
    ),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(
  value: unknown,
  name: string,
): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Content planner field ${name} must be an object`);
  return value;
}

function requireArray(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Content planner field ${name} must be an array`);
  }
  return value;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Content planner field ${name} must be a non-empty string`);
  }
  return value;
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") {
    throw new Error("Content planner nullable text field must be a string");
  }
  return value;
}

function requireNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Content planner field ${name} must be a finite number`);
  }
  return value;
}

function nullableNumber(value: unknown, name: string): number | null {
  if (value === null || value === undefined) return null;
  return requireNumber(value, name);
}
