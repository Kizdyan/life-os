import type { PersonaProductionBriefInput } from "./persona-production-brief";
import { buildFormatObservation, type FormatMemoryObservation } from "./format-memory";
import { assessReferenceInsight, type ReferenceInsightAssessment } from "./reference-evidence";

export type ScenarioPlatform = "instagram" | "youtube" | "vk" | "other";
export type ScenarioObservationStatus = "metadata_only" | "user_reviewed" | "unavailable";

export interface ScenarioResearchEvidence {
  kind: "manual_link" | "allowed_search_result" | "editorial_report" | "user_note";
  observedFields: Array<"url" | "title" | "author" | "date" | "metrics" | "description">;
  sourceUrl?: string;
}

export interface ScenarioResearchItem {
  id: string;
  url: string;
  platform: ScenarioPlatform;
  observedAt: string;
  observationStatus: ScenarioObservationStatus;
  reviewedAt?: string;
  title?: string;
  author?: string;
  publishedAt?: string;
  metrics?: { views?: number; likes?: number; comments?: number };
  evidence: ScenarioResearchEvidence;
}

export interface ScenarioReferenceAnalysis {
  researchId: string;
  observationStatus: ScenarioObservationStatus;
  hook: string;
  situation: string;
  desire: string;
  obstacle: string;
  turn: string;
  payoff: string;
  editing: string;
  sound: string;
  productionComplexity: "low" | "medium" | "high";
  reviewedAt?: string;
  /** Evidence policy is derived from provenance, never from a claimed trend score. */
  evidenceUse: ReferenceInsightAssessment;
}

export interface ScenarioIdea {
  id: string;
  title: string;
  referenceIds: string[];
  originalConflict: string;
  actingTask: string;
  ending: string;
  productionComplexity: "low" | "medium" | "high";
  estimatedDurationSec: number;
  creativeProfileFit: string;
}

export interface ScenarioCreativeProfile {
  priorities: string[];
  constraints: string[];
}

/** Public, dated leads for a no-credit starting point. They are not scraped video metrics or proof that a video was watched. */
export interface FreeScenarioTrendLead {
  id: string;
  title: string;
  category: "acting" | "comedy" | "music" | "piano";
  sourceTitle: string;
  sourceUrl: string;
  publishedAt: string;
  dateKind: "published" | "observed";
  mechanism: string;
  limitation: string;
}

export const freeScenarioTrendLeads: readonly FreeScenarioTrendLead[] = [
  {
    id: "acting-audition-2026-10",
    title: "Абсурдная «проба на роль»",
    category: "acting",
    sourceTitle: "360.ru",
    sourceUrl: "https://360.ru/tekst/interesnoe/pochemu-v-sotssetjah-zavirusilsja-trend-proby-na-rol/",
    publishedAt: "2026-10-07",
    dateKind: "published",
    mechanism: "Серьёзное актёрское исполнение неожиданно незначительной роли создаёт комедийный контраст.",
    limitation: "Это журналистский разбор формата, а не просмотр Persona конкретного исходного ролика.",
  },
  {
    id: "reaction-2026-10",
    title: "My reaction · история через реакцию",
    category: "acting",
    sourceTitle: "Later · Weekly Reels Trends",
    sourceUrl: "https://later.com/blog/instagram-reels-trends/",
    publishedAt: "2026-10-23",
    dateKind: "published",
    mechanism: "Лицо и реакция становятся точкой зрения на знакомую ситуацию без объясняющего монолога.",
    limitation: "Подборка описывает формат; без ручного просмотра отдельного Reels нельзя оценить игру или удержание.",
  },
  {
    id: "shorts-discovery-2026-10",
    title: "Поиск Shorts по актёрству и музыке",
    category: "music",
    sourceTitle: "YouTube Shorts search",
    sourceUrl: "https://www.youtube.com/results?search_query=%D0%B0%D0%BA%D1%82%D1%91%D1%80+%D0%BC%D1%83%D0%B7%D1%8B%D0%BA%D0%B0+shorts",
    publishedAt: "2026-10-30",
    dateKind: "observed",
    mechanism: "Публичный поиск помогает вручную найти свежие варианты короткого актёрского и музыкального формата.",
    limitation: "Это вход в поиск, а не подтверждение конкретного тренда, просмотров или качества отдельных видео.",
  },
];

export type ScenarioScriptPurpose = "hook" | "development" | "ending";
export type ScenarioReviewRole = "dramaturg" | "director" | "producer";

export interface ScenarioScriptBeat {
  purpose: ScenarioScriptPurpose;
  line: string;
  action: string;
  durationSec: number;
}

export interface ScenarioScriptFinding {
  role: ScenarioReviewRole;
  severity: "blocking" | "note";
  code: string;
  message: string;
}

export interface ScenarioScriptReview {
  revisionId: string;
  status: "needs_revision" | "ready_for_author";
  findings: ScenarioScriptFinding[];
}

export interface ScenarioScriptRevision {
  id: string;
  number: number;
  createdAt: string;
  reason?: string;
  beats: ScenarioScriptBeat[];
  sourceFacts: string[];
  review?: ScenarioScriptReview;
}

export interface ScenarioScriptApproval {
  revisionId: string;
  author: string;
  comment: string;
  approvedAt: string;
}

export interface ScenarioScript {
  idea: ScenarioIdea;
  revisions: ScenarioScriptRevision[];
  currentRevisionId: string;
  currentRevision: ScenarioScriptRevision;
  approval?: ScenarioScriptApproval;
}

const fields = new Set<ScenarioResearchEvidence["observedFields"][number]>([
  "url", "title", "author", "date", "metrics", "description",
]);

export function validateScenarioResearch(items: ScenarioResearchItem[]): ScenarioResearchItem[] {
  if (!Array.isArray(items) || items.length === 0) throw new Error("Research needs at least one source");
  const urls = new Set<string>();
  return items.map((item) => {
    if (!item || typeof item !== "object" || !nonEmpty(item.id)) throw new Error("Research ID is required");
    const url = canonicalUrl(item.url);
    if (urls.has(url)) throw new Error("Duplicate research URL");
    urls.add(url);
    if (!validDate(item.observedAt)) throw new Error("Research observation date is invalid");
    if (!validPlatform(item.platform)) throw new Error("Research platform is invalid");
    if (!validStatus(item.observationStatus)) throw new Error("Research observation status is invalid");
    if (!item.evidence || !["manual_link", "allowed_search_result", "editorial_report", "user_note"].includes(item.evidence.kind)) {
      throw new Error("Research evidence is invalid");
    }
    const observedFields = uniqueFields(item.evidence.observedFields);
    if (!observedFields.includes("url")) throw new Error("Research evidence must include URL");
    if (item.observationStatus === "user_reviewed" && !validDate(item.reviewedAt)) {
      throw new Error("user_reviewed research needs reviewedAt");
    }
    if (item.metrics && !observedFields.includes("metrics")) {
      throw new Error("Research metrics need evidence");
    }
    const metrics = item.metrics ? normalizeMetrics(item.metrics) : undefined;
    return {
      ...item,
      id: item.id.trim(),
      url,
      title: optionalText(item.title),
      author: optionalText(item.author),
      publishedAt: item.publishedAt && validDate(item.publishedAt) ? item.publishedAt : undefined,
      reviewedAt: item.reviewedAt && validDate(item.reviewedAt) ? item.reviewedAt : undefined,
      metrics,
      evidence: {
        ...item.evidence,
        observedFields,
        sourceUrl: item.evidence.sourceUrl ? canonicalUrl(item.evidence.sourceUrl) : undefined,
      },
    };
  });
}

export function addFreeTrendLeadToScenarioResearch(
  current: ScenarioResearchItem[],
  lead: FreeScenarioTrendLead,
  observedAt: string,
): ScenarioResearchItem[] {
  return validateScenarioResearch([...current, {
    id: `trend-${lead.id}`,
    url: lead.sourceUrl,
    platform: "other",
    observedAt,
    publishedAt: lead.publishedAt,
    observationStatus: "metadata_only",
    title: lead.title,
    evidence: {
      kind: "editorial_report",
      sourceUrl: lead.sourceUrl,
      observedFields: ["url", "title", "date", "description"],
    },
  }]);
}

export function analyseScenarioReference(
  research: ScenarioResearchItem,
  input: Omit<ScenarioReferenceAnalysis, "researchId" | "evidenceUse">,
): ScenarioReferenceAnalysis {
  const [item] = validateScenarioResearch([research]);
  if (input.observationStatus !== item.observationStatus) throw new Error("Analysis status must match research evidence");
  if (input.observationStatus === "user_reviewed" && !validDate(input.reviewedAt)) {
    throw new Error("user_reviewed analysis needs reviewedAt");
  }
  const strings = [input.hook, input.situation, input.desire, input.obstacle, input.turn, input.payoff, input.editing, input.sound];
  if (strings.some((value) => !nonEmpty(value))) throw new Error("Reference analysis is incomplete");
  if (!["low", "medium", "high"].includes(input.productionComplexity)) {
    throw new Error("Reference production complexity is invalid");
  }
  return {
    ...input,
    researchId: item.id,
    evidenceUse: assessReferenceInsight({
      kind: "format",
      verification: item.observationStatus === "user_reviewed" ? "plausible" : "unverified",
      actionable: false,
      measurable: false,
      reversible: true,
      manipulative: false,
    }),
  };
}

export function suggestScenarioIdeas(input: {
  research: ScenarioResearchItem[];
  creativeProfile: ScenarioCreativeProfile;
  count: number;
}): ScenarioIdea[] {
  if (!Number.isInteger(input.count) || input.count < 5 || input.count > 10) {
    throw new Error("Idea count must be between 5 and 10");
  }
  const references = validateScenarioResearch(input.research)
    .filter((item) => item.observationStatus !== "unavailable");
  if (references.length === 0) throw new Error("Ideas need available research evidence");
  const profileFit = nonEmpty(input.creativeProfile.priorities.join(", "))
    ? `Опирается на: ${input.creativeProfile.priorities.join(", ")}.`
    : "Нужна авторская проверка соответствия Creative Profile.";
  const patterns = [
    ["Невидимая правка", "Актёр пытается выполнить всё более противоречивые заметки режиссёра в одной реплике.", "Сыграть нарастающее внутреннее сопротивление без гротеска.", "Герой находит точную, простую задачу вместо противоречий."],
    ["Пианино слышит подтекст", "Композитор подбирает аккорд к словам героя, но музыка каждый раз выдаёт настоящий подтекст.", "Переключать внешнюю собранность и внутреннюю реакцию.", "Последний аккорд говорит правду раньше персонажа."],
    ["Кастинг в собственной голове", "Одна и та же просьба звучит как три разных кастинговых задания.", "Разделить персонажей действием, а не только голосом.", "Обычная просьба оказывается самым сложным заданием."],
    ["Пауза перед дублем", "Герой готовит идеальный вход, пока за кадром меняют условие сцены.", "Сохранить естественную паузу и слушание партнёра.", "Неподготовленная реакция становится лучшим дублем."],
    ["Мелодия для неудобного разговора", "Музыкант сочиняет безопасную мелодию, чтобы не произносить важную фразу.", "Дать музыке быть действием, а не фоном.", "Фраза всё-таки звучит без музыкального прикрытия."],
    ["POV: режиссёр просит проще", "После каждой просьбы «проще» герой понимает её всё буквальнее.", "Наращивать комедию через точные физические действия.", "Финальная простота оказывается самой выразительной."],
    ["Репетиция с будущим собой", "Будущий герой комментирует нынешний дубль и случайно мешает ему.", "Отделить два состояния точной пластикой и ритмом.", "Совет из будущего оказывается обычным вниманием к партнёру."],
    ["Сцена без подходящей музыки", "Герой ищет идеальный трек, пока сама ситуация требует тишины.", "Сделать тишину активным решением персонажа.", "Выключенная музыка завершает шутку."],
    ["Один предмет меняет жанр", "Один и тот же реквизит переводит домашнюю сцену из драмы в комедию.", "Менять отношение к предмету, не меняя обстоятельство.", "Последний взгляд возвращает сцену к правде."],
    ["Не тот темп", "Актёр и пианист спорят о темпе, хотя говорят о разных вещах.", "Строить конфликт через слушание и перебивание.", "Общий ритм появляется после честной паузы."],
  ] as const;
  return patterns.slice(0, input.count).map(([title, originalConflict, actingTask, ending], index) => ({
    id: `scenario-idea-${index + 1}`,
    title,
    referenceIds: [references[index % references.length].id],
    originalConflict,
    actingTask,
    ending,
    productionComplexity: index % 3 === 0 ? "medium" : "low",
    estimatedDurationSec: 20 + (index % 3) * 5,
    creativeProfileFit: profileFit,
  }));
}

/** Starts a versioned scenario script; content remains an author draft until approval. */
export function createScenarioScript(
  idea: ScenarioIdea,
  input: { createdAt: string; beats: ScenarioScriptBeat[]; sourceFacts?: readonly string[] },
): ScenarioScript {
  const revision = createRevision({
    id: `${requireIdeaId(idea)}-script-r1`,
    number: 1,
    createdAt: input.createdAt,
    beats: input.beats,
    sourceFacts: [...(input.sourceFacts ?? [])],
  });
  return { idea: { ...idea, referenceIds: [...idea.referenceIds] }, revisions: [revision], currentRevisionId: revision.id, currentRevision: revision };
}

/** Adds an immutable revision and deliberately removes approval of the prior wording. */
export function reviseScenarioScript(
  script: ScenarioScript,
  input: { createdAt: string; beats: ScenarioScriptBeat[]; reason: string },
): ScenarioScript {
  const current = requireCurrentRevision(script);
  const revision = createRevision({
    id: `${current.id.replace(/-r\d+$/u, "")}-r${current.number + 1}`,
    number: current.number + 1,
    createdAt: input.createdAt,
    reason: input.reason,
    beats: input.beats,
    sourceFacts: current.sourceFacts,
  });
  return {
    ...script,
    idea: { ...script.idea, referenceIds: [...script.idea.referenceIds] },
    revisions: [...script.revisions, revision],
    currentRevisionId: revision.id,
    currentRevision: revision,
    approval: undefined,
  };
}

/** Separates structural criticism by role; it never claims to measure artistic talent. */
export function reviewScenarioScript(revision: ScenarioScriptRevision): ScenarioScriptReview {
  const findings: ScenarioScriptFinding[] = [];
  const purposes = new Set(revision.beats.map((beat) => beat.purpose));
  if (!purposes.has("hook") || !purposes.has("development") || !purposes.has("ending")) {
    findings.push({ role: "dramaturg", severity: "blocking", code: "missing_story_beat", message: "Нужны отдельные хук, развитие и завершение мысли." });
  }
  if (revision.beats.some((beat) => !nonEmpty(beat.action))) {
    findings.push({ role: "director", severity: "blocking", code: "missing_playable_action", message: "У каждой реплики должно быть конкретное снимаемое действие." });
  }
  const duration = revision.beats.reduce((sum, beat) => sum + beat.durationSec, 0);
  if (duration < 12 || duration > 90) {
    findings.push({ role: "producer", severity: "blocking", code: "duration_out_of_range", message: "Черновик Reels должен иметь проверяемую длительность от 12 до 90 секунд." });
  }
  if (findings.length === 0) {
    findings.push({ role: "dramaturg", severity: "note", code: "author_review_required", message: "Структура проверена; художественный выбор и фактическая достоверность требуют авторского просмотра." });
    findings.push({ role: "director", severity: "note", code: "shootability_review_required", message: "Перед съёмкой визуально проверьте действия, композицию и доступный реквизит." });
    findings.push({ role: "producer", severity: "note", code: "production_review_required", message: "До публикации отдельно подтвердите права на музыку, изображение и финальный монтаж." });
  }
  return { revisionId: revision.id, status: findings.some((finding) => finding.severity === "blocking") ? "needs_revision" : "ready_for_author", findings };
}

/** Records an explicit named author decision only after the structural review is clear. */
export function approveScenarioScript(
  script: ScenarioScript,
  input: { author: string; comment: string; approvedAt: string },
): ScenarioScript {
  const current = requireCurrentRevision(script);
  const review = reviewScenarioScript(current);
  if (review.status !== "ready_for_author") throw new Error("Script Doctor requires revision before author approval");
  if (!nonEmpty(input.author) || !nonEmpty(input.comment) || !validDate(input.approvedAt)) {
    throw new Error("Author approval is incomplete");
  }
  const reviewed = { ...current, review };
  return {
    ...script,
    revisions: script.revisions.map((revision) => revision.id === current.id ? reviewed : revision),
    currentRevision: reviewed,
    approval: { revisionId: current.id, author: input.author.trim(), comment: input.comment.trim(), approvedAt: input.approvedAt },
  };
}

/** The existing Production Pipeline remains the only route from an approved script to a brief. */
export function scenarioScriptToProductionBriefInput(script: ScenarioScript): PersonaProductionBriefInput {
  const current = requireCurrentRevision(script);
  if (script.approval?.revisionId !== current.id) throw new Error("Current script needs explicit author approval before Production Brief");
  const review = reviewScenarioScript(current);
  if (review.status !== "ready_for_author") throw new Error("Script Doctor blocks Production Brief conversion");
  return {
    idea: {
      id: requireIdeaId(script.idea),
      title: requireText(script.idea.title, "idea.title"),
      angle: current.beats.map((beat) => beat.line.trim()).join(" "),
      format: "reel",
    },
    sourceFacts: [...current.sourceFacts],
  };
}

/**
 * Records only a named author approval as Format Memory. It preserves a reusable
 * mechanic, not somebody else's plot and never asserts audience performance.
 */
export function scenarioScriptToFormatMemoryObservation(script: ScenarioScript): FormatMemoryObservation {
  const current = requireCurrentRevision(script);
  const approval = script.approval;
  if (!approval || approval.revisionId !== current.id) {
    throw new Error("Current script needs explicit author approval before Format Memory");
  }
  return buildFormatObservation({
    formatKey: `persona-scenario:${script.idea.id}`,
    label: script.idea.title,
    mechanics: current.beats.map((beat) => beat.action),
    sourceAssetId: current.id,
    userSignal: "explicit_approval",
    audienceSignal: "unknown",
    createdAt: approval.approvedAt,
  });
}

function canonicalUrl(value: string): string {
  if (!nonEmpty(value)) throw new Error("Research URL is required");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Research URL is invalid"); }
  if (!/^https?:$/.test(url.protocol)) throw new Error("Research URL is invalid");
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (key.toLowerCase().startsWith("utm_")) url.searchParams.delete(key);
  return url.toString();
}

function createRevision(input: Omit<ScenarioScriptRevision, "review">): ScenarioScriptRevision {
  if (!nonEmpty(input.id) || !Number.isInteger(input.number) || input.number < 1 || !validDate(input.createdAt)) {
    throw new Error("Script revision metadata is invalid");
  }
  if (input.reason !== undefined && !nonEmpty(input.reason)) throw new Error("Script revision reason is invalid");
  if (!Array.isArray(input.beats) || input.beats.length === 0) throw new Error("Script revision needs at least one beat");
  const beats = input.beats.map((beat, index) => {
    if (!beat || !["hook", "development", "ending"].includes(beat.purpose) || !nonEmpty(beat.line) || !Number.isFinite(beat.durationSec) || beat.durationSec <= 0) {
      throw new Error(`Script beat ${index + 1} is invalid`);
    }
    return { ...beat, line: beat.line.trim(), action: typeof beat.action === "string" ? beat.action.trim() : "" };
  });
  const sourceFacts = input.sourceFacts.map((fact, index) => requireText(fact, `sourceFacts[${index}]`));
  return { ...input, id: input.id.trim(), reason: input.reason?.trim(), beats, sourceFacts };
}

function requireCurrentRevision(script: ScenarioScript): ScenarioScriptRevision {
  const current = script.revisions.find((revision) => revision.id === script.currentRevisionId);
  if (!current || current.id !== script.currentRevision.id) throw new Error("Current script revision is invalid");
  return current;
}

function requireIdeaId(idea: ScenarioIdea): string {
  return requireText(idea.id, "idea.id");
}

function normalizeMetrics(metrics: NonNullable<ScenarioResearchItem["metrics"]>): NonNullable<ScenarioResearchItem["metrics"]> {
  for (const value of Object.values(metrics)) if (!Number.isSafeInteger(value) || value < 0) throw new Error("Research metrics are invalid");
  return { ...metrics };
}

function uniqueFields(value: ScenarioResearchEvidence["observedFields"]): ScenarioResearchEvidence["observedFields"] {
  if (!Array.isArray(value) || value.some((field) => !fields.has(field))) throw new Error("Research evidence fields are invalid");
  return [...new Set(value)];
}

function validPlatform(value: unknown): value is ScenarioPlatform {
  return value === "instagram" || value === "youtube" || value === "vk" || value === "other";
}

function validStatus(value: unknown): value is ScenarioObservationStatus {
  return value === "metadata_only" || value === "user_reviewed" || value === "unavailable";
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function optionalText(value: unknown): string | undefined {
  return nonEmpty(value) ? value.trim() : undefined;
}

function requireText(value: unknown, name: string): string {
  if (!nonEmpty(value)) throw new Error(`${name} must be a non-empty string`);
  return value.trim();
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
