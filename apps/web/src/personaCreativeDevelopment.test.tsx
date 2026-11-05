import React from "react";
import {renderToString} from "react-dom/server";
import {describe,expect,it} from "vitest";
import {approveScenarioScript,reviseScenarioScript,reviewScenarioScript} from "../../../packages/core/src/persona-scenario-intelligence";
import PersonaCreativeDevelopmentPanel from "./PersonaCreativeDevelopmentPanel";
import PersonaScenarioWorkspace from "./PersonaScenarioWorkspace";
import {
  assertPersonaCreativeReviewSignoff,personaCreativeLenses,
  personaFirstReelConcepts,stagePersonaCreativeConcept,
  latestPersonaCreativeReview,recordPersonaCreativeReview,
} from "./personaCreativeDevelopment";
import {createPersonaProject,validatePersonaProjectCollection,type PersonaScenarioWorkspace} from "./personaProjectStore";
import {actorComposerPilot} from "./personaProductionGuide";

const now="2026-11-05T15:00:00.000Z";
const empty:PersonaScenarioWorkspace={version:1,research:[],analyses:[],ideas:[]};

describe("Persona Creative Development pre-production gate",()=>{
  it("provides three truly different editorial mechanics, complete playable scripts and five explicit critiques",()=>{
    expect(personaFirstReelConcepts).toHaveLength(3);
    expect(personaCreativeLenses.map(item=>item.id)).toEqual(["producer","dramaturg","director","reels","marketing"]);
    expect(new Set(personaFirstReelConcepts.map(item=>item.mechanism))).toHaveProperty("size",3);
    expect(new Set(personaFirstReelConcepts.map(item=>item.id))).toHaveProperty("size",3);
    for(const concept of personaFirstReelConcepts){
      expect(concept.idea.origin).toBe("template_fallback");
      expect(concept.idea.aiProvenance).toBeUndefined();
      expect(concept.beats.length).toBeGreaterThanOrEqual(3);
      expect(concept.beats[0].purpose).toBe("hook");
      expect(concept.beats.at(-1)?.purpose).toBe("ending");
      expect(concept.beats.every(beat=>beat.line.trim()&&beat.action.trim()&&beat.editIntent?.trim())).toBe(true);
      expect(concept.beats.reduce((total,beat)=>total+beat.durationSec,0)).toBe(concept.idea.estimatedDurationSec);
      for(const lens of personaCreativeLenses){
        expect(concept.criticism[lens.id].weakness.length).toBeGreaterThan(20);
        expect(concept.criticism[lens.id].revision.length).toBeGreaterThan(20);
      }
      const newScript=stagePersonaCreativeConcept(empty,concept,now).script!;
      expect(newScript.approval).toBeUndefined();
      expect(reviewScenarioScript(newScript.currentRevision).status).toBe("ready_for_author");
    }
  });

  it("never overwrites an existing approved script or silently changes it when concepts are compared",()=>{
    const first=stagePersonaCreativeConcept(empty,personaFirstReelConcepts[0],now);
    const approved=approveScenarioScript(first.script!,{
      author:"Тестовый автор",comment:"Прочитал и одобрил",approvedAt:"2026-11-05T15:02:00.000Z",
    });
    const withApproval={...first,script:approved};
    const snapshot=JSON.stringify(approved);
    const next=stagePersonaCreativeConcept(withApproval,personaFirstReelConcepts[1],now);
    expect(next.script).toBe(approved);
    expect(JSON.stringify(next.script)).toBe(snapshot);
    expect(next.ideas).toHaveLength(2);
    expect(stagePersonaCreativeConcept(next,personaFirstReelConcepts[1],now)).toBe(next);
  });

  it("requires an author decision tied to the exact current revision, not a structural PASS or old signoff",()=>{
    const first=stagePersonaCreativeConcept(empty,personaFirstReelConcepts[0],now);
    const script=first.script!;
    const signoff={revisionId:script.currentRevisionId,reviewer:"author" as const,
      decision:"ready_for_author" as const,comment:"Я проверил мотивацию, актёрские задачи и музыкальное развитие.",
      createdAt:now};
    expect(()=>assertPersonaCreativeReviewSignoff(script.currentRevisionId,undefined)).toThrow(/авторская оценка/);
    expect(()=>assertPersonaCreativeReviewSignoff(script.currentRevisionId,{
      ...signoff,decision:"needs_revision"
    })).toThrow(/авторская оценка/);
    expect(()=>assertPersonaCreativeReviewSignoff(script.currentRevisionId,{
      ...signoff,comment:"ОК"
    })).toThrow(/авторская оценка/);
    expect(()=>assertPersonaCreativeReviewSignoff(script.currentRevisionId,signoff)).not.toThrow();
    const changed=reviseScenarioScript(script,{
      createdAt:"2026-11-05T15:05:00.000Z",
      reason:"Новое актёрское действие",
      beats:script.currentRevision.beats.map((beat,i)=>i===1?{...beat,action:beat.action+" Герой меняет решение."}:beat),
    });
    expect(()=>assertPersonaCreativeReviewSignoff(changed.currentRevisionId,signoff)).toThrow(/авторская оценка/);
  });

  it("validates saved signoffs without corrupting legacy workspaces",()=>{
    const project=createPersonaProject({id:"creative-test",title:"Тест",contentType:"reel",
      sourceIdea:"Актёр и композитор",now});
    const signoff={revisionId:"revision-one",reviewer:"author" as const,
      decision:"needs_revision" as const,comment:"Финал пока не даёт убедительного комедийного поворота.",
      createdAt:now};
    const collection={schemaVersion:1 as const,activeProjectId:project.id,projects:[
      {...project,scenarioWorkspace:{...empty,creativeReviews:[signoff]}}
    ]};
    expect(()=>validatePersonaProjectCollection(collection)).not.toThrow();
    expect(()=>validatePersonaProjectCollection({
      ...collection,projects:[{...project,scenarioWorkspace:{
        ...empty,creativeReviews:[{...signoff,comment:"коротко"}]
      }}]
    })).toThrow(/invalid_persona_project_collection/);
    expect(()=>validatePersonaProjectCollection({
      ...collection,projects:[{...project,scenarioWorkspace:empty}]
    })).not.toThrow();
  });

  it("renders the comparison and explicit author signoff without claiming independent AI reviewers",()=>{
    const script=stagePersonaCreativeConcept(empty,personaFirstReelConcepts[0],now);
    const compare=renderToString(<PersonaCreativeDevelopmentPanel workspace={script} onChange={()=>undefined}/>);
    expect(compare).toContain("Не тот саундтрек");
    expect(compare).toContain("Два дедлайна");
    expect(compare).toContain("Один текст — три жанра");
    expect(compare).toContain("не пять независимых AI-экспертиз");
    const project=createPersonaProject({id:"creative-page",title:"Первый ролик",
      contentType:"reel",sourceIdea:"Актёр и композитор",now});
    const page=renderToString(<PersonaScenarioWorkspace project={project}
      workspace={script} creativeProfile={{priorities:[],constraints:[]}}
      onChange={()=>undefined} onCreateBrief={()=>undefined}/>);
    expect(page).toContain("Художественная приёмка редакции");
    expect(page).toContain("Не снимать — доработать");
    expect(page).toContain("Аргументы творческой оценки");
    expect(page).toContain("Утвердить сценарий");
  });
});


describe("withdrawal of author creative approval",()=>{
  const accepted={revisionId:"reel-r1",reviewer:"author" as const,
    decision:"ready_for_author" as const,
    comment:"Внимательно проверил хук, актерские действия, музыку, зрительский интерес и финал.",
    createdAt:"2026-11-05T15:30:00.000Z"};
  it("keeps only the latest decision; a rejection cannot inherit an older approval",()=>{
    const first=recordPersonaCreativeReview([],accepted);
    expect(latestPersonaCreativeReview(first,"reel-r1")?.decision).toBe("ready_for_author");
    const rejection={...accepted,decision:"needs_revision" as const,
      comment:"Финал слишком объяснительный, актёрское действие не разработано, звук нужен другой.",
      createdAt:"2026-11-05T15:31:00.000Z"};
    const next=recordPersonaCreativeReview(first,rejection);
    expect(next).toHaveLength(1);
    expect(latestPersonaCreativeReview(next,"reel-r1")?.decision).toBe("needs_revision");
    expect(()=>assertPersonaCreativeReviewSignoff("reel-r1",
      latestPersonaCreativeReview(next,"reel-r1"))).toThrow();
    expect(latestPersonaCreativeReview([accepted,rejection],"reel-r1")?.decision)
      .toBe("needs_revision","legacy duplicate records must follow latest decision");
  });
  it("never carries a creative signoff into a different revision",()=>{
    const reviews=recordPersonaCreativeReview([],accepted);
    expect(latestPersonaCreativeReview(reviews,"reel-r2")).toBeUndefined();
    expect(()=>assertPersonaCreativeReviewSignoff("reel-r2",
      latestPersonaCreativeReview(reviews,"reel-r2"))).toThrow();
    expect(()=>recordPersonaCreativeReview(reviews,
      {...accepted,comment:"Слишком коротко"})).toThrow(/Invalid author creative review/);
  });
});


describe("First actor-composer creative selection is usable with an existing scenario",()=>{
 it("shows a non-destructive new-revision action instead of trapping the user in the old seven-scene brief",()=>{
  const proposal=personaFirstReelConcepts[0];
  const workspace=stagePersonaCreativeConcept(empty,proposal,now);
  const direct=renderToString(<PersonaCreativeDevelopmentPanel
   workspace={workspace} onChange={()=>undefined} onCreateRevision={()=>undefined}/>);
  expect(direct).toContain("Создать НОВУЮ неутверждённую редакцию из этой концепции");
  const project=createPersonaProject({
   id:"actor-composer-creative-test",title:actorComposerPilot.title,
   sourceIdea:actorComposerPilot.angle,contentType:"reel",now,
  });
  const html=renderToString(<PersonaScenarioWorkspace
   project={project} workspace={workspace}
   creativeProfile={{priorities:[],constraints:[]}}
   onChange={()=>undefined} onCreateBrief={()=>undefined}/>);
  expect(html).toContain("Создать НОВУЮ неутверждённую редакцию из этой концепции");
  expect(html).toContain("Творческое сравнение первого ролика");
  expect(html).toContain("Не снимать — доработать");
  expect(html).not.toContain("Снять ролик сейчас");
 });
});


describe("shoot brief conversion is blocked by a withdrawn creative signoff",()=>{
 it("does not display an old approval after creative signoff was withdrawn",()=>{
  const initial=stagePersonaCreativeConcept(empty,personaFirstReelConcepts[0],now);
  const approved=approveScenarioScript(initial.script!,{
   author:"Тестовый автор",comment:"Формально одобренная старая редакция",
   approvedAt:"2026-11-05T15:05:00.000Z",
  });
  const reviewed={revisionId:approved.currentRevisionId,reviewer:"author" as const,
   decision:"ready_for_author" as const,comment:"Конфликт, реплики, музыка и финал заслуживают внимания.",
   createdAt:"2026-11-05T15:06:00.000Z"};
  const project=createPersonaProject({id:"creative-withdrawal",title:actorComposerPilot.title,
   sourceIdea:actorComposerPilot.angle,contentType:"reel",now});
  const render=(reviews:PersonaScenarioWorkspace["creativeReviews"])=>
   renderToString(<PersonaScenarioWorkspace project={project}
    workspace={{...initial,script:approved,creativeReviews:reviews}}
    creativeProfile={{priorities:[],constraints:[]}}
    onChange={()=>undefined} onCreateBrief={()=>undefined}/>);
  const before=render([reviewed]);
  expect(before).toContain("Создать съёмочный бриф");
  expect(before).toContain("Творческая приёмка");
  expect(before).toContain("Сценарий уже утверждён");
  expect(before).toContain("Не снимать — доработать");
  const after=render([reviewed,{...reviewed,decision:"needs_revision" as const,
   comment:"Переоценил сценарий: шутка объясняется словами, музыкальная идея не раскрыта.",
   createdAt:"2026-11-05T15:07:00.000Z"}]);
  expect(after).not.toContain("Создать съёмочный бриф");
  expect(after).not.toContain("Сценарий уже утверждён");
  expect(after).toContain("Художественная приёмка");
  expect(after).toContain("Ещё не одобрен автором");
  expect(after).toContain("Нужна переработка");
 });
});
