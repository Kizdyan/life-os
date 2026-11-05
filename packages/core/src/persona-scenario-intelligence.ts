import { buildPersonaProductionBrief, type PersonaProductionBrief, type PersonaProductionBriefInput, type PersonaProductionIdea, type PersonaPreEditPlan } from "./persona-production-brief.js";
import { buildFormatObservation, type FormatMemoryObservation } from "./format-memory.js";
import { assessReferenceInsight, type ReferenceInsightAssessment } from "./reference-evidence.js";

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
  /** Practical risk to resolve before shooting, never a forecast of reach.
   * Optional for scripts saved before this field existed. */
  productionRisk?: string;
  estimatedDurationSec: number;
  creativeProfileFit: string;
  /** How the concept was actually produced, not a prediction of audience success. */
  origin?: "reviewed_reference" | "template_fallback" | "ai_generated";
  /** Actual provider/model of proposed concept; NEVER publication approval. */
  aiProvenance?: {provider:"perplexity_agent"|"ollama";model:string;modelId:string;runId:string;status:"unapproved"};
  evidenceNote?: string;
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
  /** Author's planned cut, sound or reaction, versioned together with the words. */
  editIntent?: string;
}

function defaultPreEditVisualIntent(
  beat: ScenarioScriptBeat,
  index: number,
  idea: ScenarioIdea,
): NonNullable<PersonaPreEditPlan["scenes"][number]["visualIntent"]> {
  return {
    framing: index === 0 || beat.purpose === "ending" ? "close-up" : "medium",
    angle: index === 0
      ? "На уровне глаз; первое физическое действие читается в кадре."
      : "Ракурс выбирается по действию героя; не терять лицо и значимый реквизит.",
    cameraMovement: "Статичный дубль; движение камеры только если оно усиливает уже запланированное действие.",
    lighting: "Мягкий фронтальный источник чуть выше глаз; не смешивать дневной и холодный искусственный свет.",
    performance: `Актёрская задача: ${idea.actingTask} Действие кадра: ${beat.action}`,
  };
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

/**
 * These labels make creative problems discussable without pretending that a
 * deterministic check can measure talent, audience response, or originality
 * across the internet.  Categories not supported by direct evidence stay for
 * a human or local-model editorial pass rather than being guessed here.
 */
export type ScenarioCreativeFailureCategory =
  | "brief_parroting"
  | "generic_dialogue"
  | "repeated_line"
  | "uniform_timing"
  | "missing_protagonist_goal"
  | "missing_conflict"
  | "weak_escalation"
  | "unearned_twist"
  | "predictable_payoff"
  | "unplayable_actor_action"
  | "expository_dialogue"
  | "late_payoff"
  | "unshootable_scene"
  | "unverified_fact"
  | "source_imitation"
  | "format_mismatch";

export interface ScenarioCreativeRiskFinding {
  category: ScenarioCreativeFailureCategory;
  beatOrders: number[];
  fragment: string;
  severity: "needs_revision" | "human_review";
  explanation: string;
  proposedFix: string;
}

export interface ScenarioCreativeRiskAssessment {
  revisionId: string;
  method: "heuristic";
  findings: ScenarioCreativeRiskFinding[];
  notice: string;
}

export interface ScenarioScriptRevision {
  id: string;
  number: number;
  createdAt: string;
  reason?: string;
  beats: ScenarioScriptBeat[];
  sourceFacts: string[];
  /** Creative premise valid for this exact revision; older projects omit it. */
  ideaSnapshot?: ScenarioIdea;
  review?: ScenarioScriptReview;
}

/**
 * Detect only directly demonstrable failure patterns.  It deliberately does
 * not infer conflict, originality or comic quality from word counts: those
 * require a real editor or a separately labelled model pass.
 */
export function assessScenarioCreativeRisks(revision: Pick<ScenarioScriptRevision, "id" | "beats">): ScenarioCreativeRiskAssessment {
  const findings: ScenarioCreativeRiskFinding[] = [];
  const duplicateOrders = new Map<string, number[]>();
  revision.beats.forEach((beat, index) => {
    const normalized = beat.line.toLocaleLowerCase("ru-RU").replace(/\s+/gu, " ").trim();
    if (!normalized) return;
    duplicateOrders.set(normalized, [...(duplicateOrders.get(normalized) ?? []), index + 1]);
  });
  for (const [line, orders] of duplicateOrders) {
    if (orders.length < 2) continue;
    findings.push({
      category: "repeated_line",
      beatOrders: orders,
      fragment: line,
      severity: "needs_revision",
      explanation: `Одна и та же реплика повторяется в кадрах ${orders.join(", ")}; это подтверждаемый признак, что действие сцены могло не развиться.`,
      proposedFix: "Оставьте повтор только если он является осмысленным рефреном; иначе дайте каждому следующему кадру новый выбор, реакцию или изменение обстоятельств.",
    });
  }
  const durations = revision.beats.map((beat) => beat.durationSec);
  if (durations.length >= 4 && new Set(durations).size === 1) {
    findings.push({
      category: "uniform_timing",
      beatOrders: revision.beats.map((_, index) => index + 1),
      fragment: `${durations[0]} сек. во всех кадрах`,
      severity: "human_review",
      explanation: "Все кадры имеют одинаковую длительность. Это не доказывает плохой ритм, но требует ручной проверки пауз, хука, реакции и финала.",
      proposedFix: "Проверьте монтаж по действию: короткий хук, достаточная пауза для реакции и длительность, оправданная музыкой или репликой, а не шаблоном.",
    });
  }
  const firstLine=(revision.beats[0]?.line??"").normalize("NFKC")
    .toLocaleLowerCase("ru-RU").replaceAll("ё","е").trim();
  if (/^(?:я|мы)\s+(?:актер|композитор|музыкант|режиссер|блогер)(?=$|[^\p{L}\p{N}])/u.test(firstLine)) {
    findings.push({
      category:"expository_dialogue",beatOrders:[1],
      fragment:revision.beats[0].line,severity:"human_review",
      explanation:"Первая реплика представляет профессию автора, а не обязательно показывает событие. Для незнакомого зрителя это возможный риск слабого хука, но не доказательство плохого сценария.",
      proposedFix:"Попробуйте начать с действия, звука или конфликта, раскрывая профессию через поведение героя; сознательно оставьте знакомство, только если оно драматургически необходимо.",
    });
  }
  if (revision.beats.some(beat=>/^(?:и\s+)?у\s+нас\s+есть\s+проблема[.!?\s]*$/iu.test(beat.line.trim()))) {
    const orders=revision.beats.flatMap((beat,index)=>
      /^(?:и\s+)?у\s+нас\s+есть\s+проблема[.!?\s]*$/iu.test(beat.line.trim())?[index+1]:[]);
    findings.push({
      category:"generic_dialogue",beatOrders:orders,fragment:"У нас есть проблема",
      severity:"human_review",
      explanation:"Реплика обозначает проблему, но сама по себе не даёт зрителю конкретного нового обстоятельства. Такая интрига может работать только при выразительном действии рядом.",
      proposedFix:"Дайте предметное препятствие прямо в кадре или замените абстрактное сообщение на действие, которое меняет ситуацию.",
    });
  }
  const total=durations.reduce((sum,value)=>sum+value,0);
  const endingStart=total-(durations.at(-1)??0);
  if (durations.length>=4&&total>=20&&endingStart/total>0.8) {
    findings.push({
      category:"late_payoff",beatOrders:[durations.length],
      fragment:`Финальный блок начинается приблизительно на ${Math.round(endingStart/total*100)}% длительности`,
      severity:"human_review",
      explanation:"Финальная сцена начинается после четырёх пятых ролика. Это измеренный факт структуры, но не доказательство низкого удержания: нужно проверить, есть ли повороты раньше.",
      proposedFix:"Проверьте, возникают ли самостоятельные события в первых секундах; при необходимости перенесите один поворот вперёд или сократите служебную экспозицию.",
    });
  }
  return {
    revisionId: revision.id,
    method: "heuristic",
    findings,
    notice: "Эта проверка не измеряет художественную силу, юмор, актёрскую игру, оригинальность или будущий успех ролика. Такие выводы требуют живой редакторской оценки или отдельно помеченного локального модельного разбора.",
  };
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

/**
 * Free deterministic creative prompts. Without specifically reviewed video
 * observations, prewritten concepts are labelled as fallback AND cannot claim
 * a reference source. With observations, they explicitly incorporate the
 * recorded dramatic mechanics, not a fabricated trend or invented metric.
 * This is NOT local LLM generation and should never be described as such.
 */
export function suggestScenarioIdeas(input: {
  research: ScenarioResearchItem[];
  analyses?: ScenarioReferenceAnalysis[];
  creativeProfile: ScenarioCreativeProfile;
  count: number;
}): ScenarioIdea[] {
  if (!Number.isInteger(input.count) || input.count < 2 || input.count > 10) {
    throw new Error("Idea count must be between 2 and 10");
  }
  // A fully empty research inbox can still create clearly labelled fallback ideas.
  const references = input.research.length ? validateScenarioResearch(input.research) : [];
  if (references.length>0 && !references.some((item)=>item.observationStatus !== "unavailable")) {
    throw new Error("Ideas need available research evidence");
  }
  const profileFit = nonEmpty(input.creativeProfile.priorities.join(", "))
    ? `Учитываем направления: ${input.creativeProfile.priorities.join(", ")}.`
    : "Creative Profile ещё не загружен; художественную пригодность нужно подтвердить.";
  const verified = (input.analyses ?? []).filter(analysis => {
    const linked = references.find(ref => ref.id === analysis.researchId);
    return linked?.observationStatus === "user_reviewed" &&
      analysis.observationStatus === "user_reviewed" &&
      Boolean(analysis.reviewedAt && linked.reviewedAt);
  });
  const patterns = [
    ["Смена условий на кинопробе", "На настоящей кинопробе герой теряет возможность выполнить простую задачу: режиссёр неожиданно меняет обстоятельства.", "Добиться повторного шанса, скрывая тревогу.", "Герой обнаруживает, что важнее не задание, а его собственная реакция."],
    ["Аккорд вместо объяснения", "Персонаж пытается скрыть неловкость, но неверный аккорд выдаёт его истинную реакцию.", "Сохранить лицо и не перестать играть.", "Правильное решение внезапно оказывается тишиной."],
    ["Неудобная роль", "Роль, к которой герой готовился, достаётся ему в совершенно неожиданной бытовой ситуации.", "Добиться признания, не играя на публику.", "Окружающие принимают за актёрскую игру подлинное действие."],
    ["Два внутренних голоса", "Два разных решения конкурируют прямо в момент важной встречи.", "Скрыть сомнение и всё-таки принять решение.", "Герой неожиданно выбирает третью, простую стратегию."],
    ["Пауза в решающий момент", "На репетиции партнёр перестаёт подавать нужную реплику, и герой вынужден действовать.", "Добыть ответ, не нарушив сцену.", "Молчание меняет отношения персонажей."],
    ["Режиссёрский комментарий", "Участники сцены по-разному понимают одну режиссёрскую задачу, и недоразумение растёт.", "Убедить партнёра в своём понимании.", "Оба понимают, что слушали не того человека."],
    ["Слова против музыки", "Герой обещает спокойный разговор, но музыкальный мотив каждый раз обостряет конфликт.", "Вернуть спокойствие, не скрыв правду.", "Герой намеренно выбирает один простой звук."],
    ["Незаметный предмет", "Незначительный реквизит лишает персонажа возможности продолжать привычную роль.", "Сохранить контроль без реквизита.", "Герой впервые действует по-настоящему."],
    ["Ошибка темпа", "Два человека не могут договориться, потому что одновременно говорят о музыкальном и жизненном темпе.", "Быть услышанным партнёром.", "Общий ритм появляется из случайной паузы."],
    ["Реакция без слов", "Человек получает сообщение, на которое невозможно ответить вслух, и каждое невербальное действие только усложняет положение.", "Сохранить достоинство в неловкой ситуации.", "Последняя реакция меняет значение первой."],
  ] as const;
  return patterns.slice(0,input.count).map(([title, seedConflict, actingTask, seedEnding], index) => {
    const observation = verified.length ? verified[index % verified.length] : undefined;
    const origin = observation ? "reviewed_reference" : "template_fallback";
    return {
      id: `scenario-idea-${index+1}`,
      title,
      // NO reference attribution in fallback mode.
      referenceIds: observation ? [observation.researchId] : [],
      originalConflict: observation
        ? `${seedConflict} При разработке использовать наблюдаемую механику препятствия: «${observation.obstacle}» и смены ожиданий: «${observation.turn}». Не переносить чужие конкретные реплики и события.`
        : seedConflict,
      actingTask: observation
        ? `${actingTask} Для актёрской проработки учесть отмеченную цель персонажа: «${observation.desire}»; придумать новую ситуацию.`
        : actingTask,
      ending: observation
        ? `${seedEnding} Проверить, как найденный принцип завершения «${observation.payoff}» применим к оригинальному герою.`
        : seedEnding,
      productionComplexity: index%3===0 ? "medium" : "low",
      productionRisk: index%3===0
        ? "Нужны различимые реакции и два контрастных действия; без них поворот останется только в тексте."
        : "Проверьте, что действие и звук читаются с первого дубля; не заменяйте отсутствующую реакцию декоративной склейкой.",
      estimatedDurationSec: 20 + index%3*5,
      creativeProfileFit:profileFit,
      origin,
      evidenceNote:observation
        ? `Основано на ручном разборе просмотренного референса ${observation.researchId}; это структурная адаптация, не генерация ИИ и не прогноз охватов.`
        : "Шаблонная идея: референс не просмотрен и не разобран; исследовательская связь не заявляется.",
    };
  });
}

/** Pre-shoot edit intentions are created from the SCRIPT REVISION, not from ASR or
 * nonexistent footage. Evidence is linked by real reference IDs, without claims
 * about viral performance or measured Instagram retention.
 */
export function buildScenarioPreEditPlan(
  revision: Pick<ScenarioScriptRevision,"id"|"beats">,
  idea: ScenarioIdea,
  research: readonly ScenarioResearchItem[] = [],
): PersonaPreEditPlan {
  if (!revision.id.trim() || !revision.beats.length) throw new Error("Pre-edit plan needs a script revision");
  const linked=research.filter(item=>idea.referenceIds.includes(item.id)&&item.observationStatus!=="unavailable");
  const reviewed=linked.filter(item=>item.observationStatus==="user_reviewed"&&Boolean(item.reviewedAt));
  const level:PersonaPreEditPlan["researchEvidence"]["level"]=
    reviewed.length?"reviewed_reference":linked.length?"metadata_only":"hypothesis_only";
  const note=level==="reviewed_reference"
    ?"Сохранён разбор просмотренного референса. Это наблюдение о творческом приёме, не доказательство охватов или успеха."
    :level==="metadata_only"
    ?"Есть только ссылки или метаданные. Содержание и эффективность конкретных Reels не подтверждены."
    :"Нет подтверждённого исследования Instagram для этой идеи. Это творческая гипотеза, а не проверенный тренд.";
  return {
    version:1,kind:"persona-pre-edit-plan-v1",status:"intent_only",origin:"scenario_revision",
    sourceRevisionId:revision.id,
    researchEvidence:{level,sourceUrls:linked.map(item=>item.url),note},
    scenes:revision.beats.map((beat,index)=>{
      if(!beat.line.trim()||!beat.action.trim()||!Number.isFinite(beat.durationSec)||beat.durationSec<=0)
        throw new Error("Pre-edit planning needs complete, timed scenes");
      const fallback=beat.purpose==="hook"
        ?"Начать с действия и реплики, без вступительной заставки; резать по смыслу."
        :beat.purpose==="ending"
        ?"Выдержать реакцию и закончить на подтверждённом панчлайне."
        :"Склейка по реакции или действию, с сохранением смысловой паузы.";
      return {order:index+1,line:beat.line,durationSec:beat.durationSec,
        editIntent:beat.editIntent?.trim()||fallback,
        audioIntent:"Сохранить реальную речь; музыкальные акценты — только по утверждённому плану и при наличии записанного звука.",
        subtitleIntent:"Синхронизировать с фактическими словами, с учётом безопасных полей Reels.",
        visualIntent:defaultPreEditVisualIntent(beat,index,idea),
        mediaStatus:"awaiting_author_footage" as const};
    }),
    colorIntent:"Natural Clean как исходное направление: нейтральный баланс белого, естественный тон кожи и без изменения лица, очков или геометрии.",
    publicationApproved:false,
  };
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
  input: { createdAt: string; beats: ScenarioScriptBeat[]; reason: string; idea?: ScenarioIdea },
): ScenarioScript {
  const current = requireCurrentRevision(script);
  // A new dramatic concept changes the creative premise, never the stable project identity.
  const nextIdea = input.idea
    ? {...input.idea,id:script.idea.id,referenceIds:[...input.idea.referenceIds]}
    : {...script.idea,referenceIds:[...script.idea.referenceIds]};
  // Backfill original story metadata before switching concepts, so restoring a
  // prior version restores its original producer/director context too.
  const prior = input.idea ? script.revisions.map(item=>({
    ...item,ideaSnapshot:item.ideaSnapshot??
      {...script.idea,referenceIds:[...script.idea.referenceIds]},
  })) : script.revisions;
  const previousIdea=current.ideaSnapshot;
  const revision = createRevision({
    id: `${current.id.replace(/-r\d+$/u, "")}-r${current.number + 1}`,
    number: current.number + 1,
    createdAt: input.createdAt,
    reason: input.reason,
    beats: input.beats,
    sourceFacts: current.sourceFacts,
    ...(input.idea ? {ideaSnapshot:nextIdea}
      : previousIdea ? {ideaSnapshot:previousIdea} : {}),
  });
  return {
    ...script,
    idea: nextIdea,
    revisions: [...prior, revision],
    currentRevisionId: revision.id,
    currentRevision: revision,
    approval: undefined,
  };
}

/** Separates structural criticism by role; it never claims to measure artistic talent. */
export function reviewScenarioScript(revision: ScenarioScriptRevision): ScenarioScriptReview {
  const findings: ScenarioScriptFinding[] = [];
  if (revision.beats.length < 3 || revision.beats.length > 12) {
    findings.push({role:"dramaturg",severity:"blocking",code:"invalid_beat_count",message:"Для этой редакции нужны 3–12 осмысленных сценических блоков."});
  }
  if (revision.beats[0]?.purpose !== "hook" ||
      revision.beats[revision.beats.length - 1]?.purpose !== "ending" ||
      revision.beats.filter(beat=>beat.purpose==="hook").length !== 1 ||
      revision.beats.filter(beat=>beat.purpose==="ending").length !== 1) {
    findings.push({role:"dramaturg",severity:"blocking",code:"broken_drama_order",message:"Один хук должен открывать сцену, один финал завершать; между ними — развитие."});
  }
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
 * Converts the EXACT approved words, actions and timings to the established
 * Production Brief contract. Only technical camera/capture advice is synthesized;
 * the author-script is never sent through the three-beat template builder.
 * Production QA and its separate editorial gate still run on import.
 */
export function scenarioScriptToProductionBrief(
  script: ScenarioScript,
  selectedProject: PersonaProductionIdea,
  research: readonly ScenarioResearchItem[] = [],
): PersonaProductionBrief {
  const current = requireCurrentRevision(script);
  if (!script.approval || script.approval.revisionId !== current.id) {
    throw new Error("Current script needs explicit author approval before Production Brief");
  }
  if (reviewScenarioScript(current).status !== "ready_for_author") {
    throw new Error("Script Doctor blocks Production Brief conversion");
  }
  if (!["reel", "short", "story"].includes(selectedProject.format)) {
    throw new Error("A video Production Brief requires a video project");
  }
  // Use the original project's identity so edits and imports retain provenance.
  const base = buildPersonaProductionBrief({
    idea: selectedProject,
    sourceFacts: current.sourceFacts,
  });
  const authored = current.beats.map((beat, index) => ({
    order: index + 1,
    line: beat.line,
    action: beat.action,
    durationSec: beat.durationSec,
  }));
  const preEditPlan = buildScenarioPreEditPlan(current,script.idea,research);
  const shots: PersonaProductionBrief["shots"] = authored.map((beat, index) => {
    const visual=preEditPlan.scenes[index].visualIntent;
    return {
      order: beat.order,
      durationSec: beat.durationSec,
      framing: visual?.framing ?? (index === 0 || index === authored.length - 1 ? "close-up" : "medium"),
      angle: visual?.angle ?? (index === 0 ? "На уровне глаз, проверить первое визуальное действие" : "Выбрать ракурс по движению героя"),
      cameraMovement: visual?.cameraMovement ?? "Проверить, нужна ли камера в движении; по умолчанию статичный дубль",
      lighting: visual?.lighting ?? base.capture.lighting,
      // The authored physical action is copied exactly, never a generated summary.
      action: beat.action,
    };
  });
  const durationSec = authored.reduce((sum, beat) => sum + beat.durationSec, 0);
  return {
    ...base,
    hook: {
      firstSeconds: authored[0].line,
      visual: authored[0].action,
      delivery: "Текст и действие утверждены автором; проверить исполнение и визуальный ритм на репетиции.",
    },
    script: authored,
    shots,
    preEditPlan,
    adaptations: {
      reels: { ...base.adaptations.reels, durationSec },
      shorts: { ...base.adaptations.shorts, durationSec },
      vkClips: { ...base.adaptations.vkClips, durationSec },
    },
    postProduction: {...base.postProduction,color:preEditPlan.colorIntent??base.postProduction.color},
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
    if(beat.editIntent!==undefined&&typeof beat.editIntent!=="string")
      throw new Error("Pre-edit note must be text");
    const {editIntent,...rest}=beat;
    return {...rest,line:beat.line.trim(),action:typeof beat.action==="string"?beat.action.trim():"",
      ...(editIntent?.trim()?{editIntent:editIntent.trim()}:{})};
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
