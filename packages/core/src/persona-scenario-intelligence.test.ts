import { describe, expect, it } from "vitest";
import {
  analyseScenarioReference,
  approveScenarioScript,
  createScenarioScript,
  addFreeTrendLeadToScenarioResearch,
  freeScenarioTrendLeads,
  reviewScenarioScript,
  reviseScenarioScript,
  scenarioScriptToFormatMemoryObservation,
  scenarioScriptToProductionBriefInput,
  scenarioScriptToProductionBrief,
  suggestScenarioIdeas,
  validateScenarioResearch,
} from "./persona-scenario-intelligence";
import type { ScenarioResearchItem } from "./persona-scenario-intelligence";
import { importPersonaProductionBrief, revisePersonaProductionBrief, recordPersonaEditorialDecision } from "./persona-production-pipeline";

const source: ScenarioResearchItem = {
  id: "ref-piano-pov",
  url: "https://www.youtube.com/shorts/examplePianoPOV",
  platform: "youtube" as const,
  observedAt: "2026-10-30T10:00:00.000Z",
  observationStatus: "metadata_only" as const,
  title: "POV: композитор слышит правку режиссёра",
  evidence: { kind: "manual_link" as const, observedFields: ["url", "title"] },
};

describe("Persona Scenario Intelligence research core", () => {
  it("keeps a manual link metadata-only and rejects a duplicate evidence URL", () => {
    const [item] = validateScenarioResearch([source]);
    expect(item.observationStatus).toBe("metadata_only");
    expect(item.metrics).toBeUndefined();
    expect(() => validateScenarioResearch([source, { ...source, id: "duplicate" }])).toThrow(
      "Duplicate research URL",
    );
  });

  it("rejects a claimed viewed analysis without user-review evidence", () => {
    expect(() => analyseScenarioReference({ ...source, observationStatus: "user_reviewed" }, {
      observationStatus: "user_reviewed",
      hook: "Нельзя писать это как просмотренное видео",
      situation: "Репетиция",
      desire: "Попасть в тон",
      obstacle: "Несовпадение ожиданий",
      turn: "Герой слышит другую задачу",
      payoff: "Смысловой финал",
      editing: "Не указано",
      sound: "Не указано",
      productionComplexity: "low",
    })).toThrow("reviewedAt");
  });

  it("does not turn unavailable links or unsupported metrics into evidence", () => {
    expect(() => validateScenarioResearch([{
      ...source,
      metrics: { views: 1200 },
    }])).toThrow("metrics need evidence");
    expect(() => suggestScenarioIdeas({
      research: validateScenarioResearch([{ ...source, observationStatus: "unavailable" }]),
      creativeProfile: { priorities: [], constraints: [] },
      count: 5,
    })).toThrow("available research evidence");
  });

  it("offers dated public trend leads as metadata-only evidence without inventing Reel metrics", () => {
    expect(freeScenarioTrendLeads).toHaveLength(3);
    expect(freeScenarioTrendLeads.every((lead) => lead.sourceUrl.startsWith("https://") && lead.publishedAt.length === 10)).toBe(true);
    expect(freeScenarioTrendLeads.every((lead) => !("views" in lead) && !("engagementRate" in lead))).toBe(true);

    const research = addFreeTrendLeadToScenarioResearch([], freeScenarioTrendLeads[0], "2026-10-30T12:00:00.000Z");
    expect(research[0]).toMatchObject({ observationStatus: "metadata_only", evidence: { kind: "editorial_report" } });
    expect(() => addFreeTrendLeadToScenarioResearch(research, freeScenarioTrendLeads[0], "2026-10-30T12:01:00.000Z")).toThrow("Duplicate research URL");
  });

  it("proposes original ideas that retain a verified reference ID without inventing trend metrics", () => {
    const research = validateScenarioResearch([source]);
    const ideas = suggestScenarioIdeas({
      research,
      creativeProfile: {
        priorities: ["смысловые склейки", "естественный голос"],
        constraints: ["не менять внешность", "не копировать чужой сценарий"],
      },
      count: 5,
    });

    expect(ideas).toHaveLength(5);
    expect(ideas.every((idea) => idea.referenceIds.length === 0 && idea.origin === "template_fallback")).toBe(true);
    expect(ideas.every((idea) => idea.originalConflict.length > 10)).toBe(true);
    expect(ideas.every((idea) => !("visibleMetrics" in idea))).toBe(true);
  });

  it("uses actual manually reviewed notes for research-grounded concepts without inventing views", () => {
    const reviewed=validateScenarioResearch([{
      ...source,observationStatus:"user_reviewed",reviewedAt:"2026-10-30T12:30:00Z"
    }]);
    const observation=analyseScenarioReference(reviewed[0],{
      observationStatus:"user_reviewed",reviewedAt:"2026-10-30T12:30:00Z",
      hook:"Неожиданный звук сразу в первых двух секундах",
      situation:"Человек не хочет признавать, что он нервничает",
      desire:"Оставаться собранным перед своим собеседником",
      obstacle:"Звучащий инструмент раскрывает скрытую эмоцию",
      turn:"Мелодия меняется раньше, чем герой объясняется",
      payoff:"Герой наконец слушает другого человека",
      editing:"Пауза перед крупным планом меняет смысл",
      sound:"Резкий диссонанс на сильной доле",
      productionComplexity:"low"
    });
    const researchBased=suggestScenarioIdeas({research:reviewed,analyses:[observation],
      creativeProfile:{priorities:["фортепиано"],constraints:[]},count:5});
    expect(researchBased).toHaveLength(5);
    expect(researchBased.every(idea=>idea.origin==="reviewed_reference" && idea.referenceIds[0]===source.id)).toBe(true);
    expect(researchBased[0].originalConflict).toContain("Звучащий инструмент раскрывает скрытую эмоцию");
    expect(researchBased[0].originalConflict).toContain("Мелодия меняется раньше");
    expect(researchBased[0].evidenceNote).toContain("ручном разборе");
    expect(researchBased[0]).not.toHaveProperty("views");
    const unreliable=suggestScenarioIdeas({research:reviewed,analyses:[{...observation,observationStatus:"metadata_only"}],
      creativeProfile:{priorities:[],constraints:[]},count:5});
    expect(unreliable.every(idea=>idea.origin==="template_fallback" && idea.referenceIds.length===0)).toBe(true);
  });

  it("keeps dramaturg, director and producer criticism separate and blocks an unshootable draft", () => {
    const [idea] = suggestScenarioIdeas({
      research: validateScenarioResearch([source]),
      creativeProfile: { priorities: [], constraints: [] },
      count: 5,
    });
    const script = createScenarioScript(idea, {
      createdAt: "2026-10-30T10:00:00.000Z",
      beats: [{ purpose: "development", line: "Ну вот", action: "", durationSec: 2 }],
    });
    const review = reviewScenarioScript(script.currentRevision);

    expect(review.status).toBe("needs_revision");
    expect(new Set(review.findings.map((finding) => finding.role))).toEqual(
      new Set(["dramaturg", "director", "producer"]),
    );
    expect(review.findings.some((finding) => finding.severity === "blocking")).toBe(true);
  });

  it("preserves the rejected revision, clears approval after an edit, and only converts an approved script", () => {
    const [idea] = suggestScenarioIdeas({
      research: validateScenarioResearch([source]),
      creativeProfile: { priorities: ["смысловые склейки"], constraints: [] },
      count: 5,
    });
    const draft = createScenarioScript(idea, {
      createdAt: "2026-10-30T10:00:00.000Z",
      beats: [
        { purpose: "hook", line: "Я пришёл сыграть один дубль — и получил три противоречивые задачи.", action: "Взгляд в объектив, затем пауза.", durationSec: 5 },
        { purpose: "development", line: "Я меняю интонацию, пока пианино честнее меня комментирует каждую правку.", action: "Переход к клавишам и рукам.", durationSec: 8 },
        { purpose: "ending", line: "В итоге лучший дубль начинается после того, как я перестал играть задачу.", action: "Вернуться в крупный план и оставить реакцию.", durationSec: 6 },
      ],
    });
    const approved = approveScenarioScript(draft, {
      author: "Kostya",
      comment: "Можно переводить в съёмочный бриф.",
      approvedAt: "2026-10-30T10:05:00.000Z",
    });
    const input = scenarioScriptToProductionBriefInput(approved);
    const revised = reviseScenarioScript(approved, {
      createdAt: "2026-10-30T10:10:00.000Z",
      beats: approved.currentRevision.beats.map((beat) => ({
        ...beat,
        line: beat.purpose === "hook" ? "Я пришёл сыграть один дубль — и получил четыре задачи." : beat.line,
      })),
      reason: "Автор уточнил хук.",
    });

    expect(input.idea.id).toBe(idea.id);
    expect(approved.approval?.author).toBe("Kostya");
    expect(revised.revisions).toHaveLength(2);
    expect(revised.approval).toBeUndefined();
    expect(() => scenarioScriptToProductionBriefInput(revised)).toThrow("author approval");
  });

  it("preserves every approved word, action and timing through canonical Production Brief import, QA and revisions", () => {
    const [idea] = suggestScenarioIdeas({ research: [source], creativeProfile: {priorities:["актёр"],constraints:[]}, count:5 });
    const beats = [
      { purpose:"hook" as const, line:"Не трогайте эту клавишу — у меня проба.", action:"Перехватить руку партнёра до прикосновения.", durationSec:4 },
      { purpose:"development" as const, line:"Но партнёр нажимает её, и свет меняется.", action:"Отстраниться от пианино, взглянуть на дверь.", durationSec:7 },
      { purpose:"ending" as const, line:"Теперь роль играет сам звук.", action:"Замереть, закрыть крышку и остаться в тишине.", durationSec:6 },
    ];
    const draft=createScenarioScript(idea,{createdAt:"2026-10-30T14:00:00Z",beats});
    expect(()=>scenarioScriptToProductionBrief(draft,{id:"project-real",title:"Моя сцена",angle:"Мой исходный замысел",format:"reel"})).toThrow("approval");
    const approved=approveScenarioScript(draft,{author:"Тестовый автор",comment:"Тестовое утверждение",approvedAt:"2026-10-30T14:10:00Z"});
    const selected={id:"project-real",title:"Моя сцена",angle:"Мой исходный замысел",format:"reel" as const};
    const brief=scenarioScriptToProductionBrief(approved,selected);
    expect(brief.ideaId).toBe(selected.id);
    expect(brief.sourceTitle).toBe(selected.title);
    expect(brief.sourceAngle).toBe(selected.angle);
    expect(brief.script).toEqual(beats.map((b,i)=>({order:i+1,line:b.line,action:b.action,durationSec:b.durationSec})));
    expect(brief.shots.map(x=>x.action)).toEqual(beats.map(x=>x.action));
    expect(brief.shots.map(x=>x.durationSec)).toEqual([4,7,6]);
    expect(brief.hook.firstSeconds).toBe(beats[0].line);
    expect(brief.adaptations.reels.durationSec).toBe(17);
    const pipeline=importPersonaProductionBrief({brief,selectedIdea:selected});
    expect(pipeline.stage).toBe("QA");
    expect(pipeline.materials.script).toEqual(brief.script);
    expect(pipeline.materials.productionBrief?.script).toEqual(brief.script);
    expect(pipeline.materials.editorialDecision).toBeUndefined();
    expect(pipeline.statuses.READY_FOR_SHOOT).toBe("pending");
    const shotChanged={...brief,script:brief.script.map((line,i)=>i===0?{...line,line:"Переписано после одобрения"}:line)};
    const revised=revisePersonaProductionBrief(pipeline,shotChanged);
    expect(revised.materials.editorialDecision).toBeUndefined();
    expect(revised.materials.qa?.status).toBe("needs_revision");
    expect(()=>recordPersonaEditorialDecision(revised,{decision:"approved",editor:"Тест",comment:"Тест",factReviewCompleted:true,decidedAt:"2026-10-30T14:12:00Z"})).toThrow();
  });

  it("keeps a reference as a format-only evidence record and records only an explicit approval in Format Memory", () => {
    const analysis = analyseScenarioReference(source, {
      observationStatus: "metadata_only", hook: "Смена ожидания в первой фразе.", situation: "Кастинг", desire: "Получить пробу", obstacle: "Неверная дверь", turn: "Режиссёр уже слушает", payoff: "Проба шла всё время", editing: "Смысловой переход", sound: "Пауза перед финалом", productionComplexity: "low",
    });
    const [idea] = suggestScenarioIdeas({ research: [source], creativeProfile: { priorities: [], constraints: [] }, count: 5 });
    const approved = approveScenarioScript(createScenarioScript(idea, { createdAt: "2026-10-30T10:00:00.000Z", beats: [
      { purpose: "hook", line: "Я пришёл на одну пробу и увидел три двери.", action: "Останавливается перед указателем.", durationSec: 4 },
      { purpose: "development", line: "Администратор уверяет, что меня уже смотрели.", action: "Проверяет список и слушает ответ.", durationSec: 7 },
      { purpose: "ending", line: "Лучшая проба началась в коридоре.", action: "Понимает шутку и оставляет паузу.", durationSec: 5 },
    ]}), { author: "Kostya", comment: "Сохраняю этот приём, не чужой сюжет.", approvedAt: "2026-10-30T10:05:00.000Z" });

    expect(analysis.evidenceUse.use).toBe("format_only");
    expect(scenarioScriptToFormatMemoryObservation(approved).userSignal).toBe("explicit_approval");
  });
});
