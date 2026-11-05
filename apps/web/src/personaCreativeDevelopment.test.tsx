import React from "react";
import {renderToString} from "react-dom/server";
import {describe,expect,it} from "vitest";
import {approveScenarioScript,reviseScenarioScript,reviewScenarioScript} from "../../../packages/core/src/persona-scenario-intelligence";
import PersonaCreativeDevelopmentPanel from "./PersonaCreativeDevelopmentPanel";
import PersonaScenarioWorkspace from "./PersonaScenarioWorkspace";
import {
  assertPersonaCreativeReviewSignoff,personaCreativeLenses,
  personaFirstReelConcepts,stagePersonaCreativeConcept,
} from "./personaCreativeDevelopment";
import {createPersonaProject,validatePersonaProjectCollection,type PersonaScenarioWorkspace} from "./personaProjectStore";

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
