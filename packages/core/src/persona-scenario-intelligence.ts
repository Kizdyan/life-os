export type ScenarioPlatform = "instagram" | "youtube" | "vk" | "other";
export type ScenarioObservationStatus = "metadata_only" | "user_reviewed" | "unavailable";

export interface ScenarioResearchEvidence {
  kind: "manual_link" | "allowed_search_result" | "user_note";
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
    if (!item.evidence || !["manual_link", "allowed_search_result", "user_note"].includes(item.evidence.kind)) {
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

export function analyseScenarioReference(
  research: ScenarioResearchItem,
  input: Omit<ScenarioReferenceAnalysis, "researchId">,
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
  return { ...input, researchId: item.id };
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

function canonicalUrl(value: string): string {
  if (!nonEmpty(value)) throw new Error("Research URL is required");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Research URL is invalid"); }
  if (!/^https?:$/.test(url.protocol)) throw new Error("Research URL is invalid");
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (key.toLowerCase().startsWith("utm_")) url.searchParams.delete(key);
  return url.toString();
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

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
