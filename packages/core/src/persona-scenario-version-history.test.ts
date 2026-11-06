import {describe, expect, it} from "vitest";
import {
  approveScenarioScript,
  createScenarioScript,
  reviseScenarioScript,
  type ScenarioIdea,
  type ScenarioScriptBeat,
} from "./persona-scenario-intelligence";
import {
  comparePersonaScenarioRevisions,
  restorePersonaScenarioRevision,
} from "./persona-scenario-version-history";
const idea:ScenarioIdea={
  id:"version-demo",title:"Репетиция",referenceIds:[],
  originalConflict:"Герой хочет добиться внимания партнёра без объяснений.",
  actingTask:"Убедить партнёра через действие.",ending:"Узнать смысл молчания.",
  productionComplexity:"low",estimatedDurationSec:20,creativeProfileFit:"Актёрская игра.",
};
const base:ScenarioScriptBeat[]=[
  {purpose:"hook",line:"Время уже вышло.",action:"Смотрит на закрытую дверь.",durationSec:4},
  {purpose:"development",line:"Никто меня не слышит.",action:"Стучит трижды.",durationSec:5},
  {purpose:"ending",line:"Я слышал себя.",action:"Отходит от двери.",durationSec:4},
];
const first=()=>createScenarioScript(idea,{createdAt:"2026-10-30T17:00:00Z",beats:base});
describe("Persona scenario revision comparison and restore",()=>{
  it("reports exact changed fields, added and removed beats",()=>{
    const r1=first().currentRevision;
    const revised=[base[0],{...base[1],line:"Никто не отвечает.",durationSec:7},base[2]];
    const r2={...r1,beats:revised};
    expect(comparePersonaScenarioRevisions(r1,r2)).toEqual([{
      index:1,kind:"changed",before:base[1],after:revised[1],
      changedFields:["line","durationSec"]
    }]);
    const shorter={...r1,beats:base.slice(0,2)};
    expect(comparePersonaScenarioRevisions(r1,shorter)[0].kind).toBe("removed");
    const longer={...r1,beats:[...base,base[2]]};
    expect(comparePersonaScenarioRevisions(r1,longer)[0].kind).toBe("added");
  });
  it("restores an old approved version as a NEW unapproved revision, never overwriting history",()=>{
    const approved=approveScenarioScript(first(),{
      author:"Test author",comment:"Test approval",approvedAt:"2026-10-30T17:01:00Z"});
    const r2=reviseScenarioScript(approved,{createdAt:"2026-10-30T17:02:00Z",
      reason:"Редактура",beats:base.map((beat,index)=>index===2?{...beat,line:"Что на самом деле произошло?"}:beat)});
    expect(r2.approval).toBeUndefined();
    const restored=restorePersonaScenarioRevision(r2,approved.currentRevisionId,"2026-10-30T17:03:00Z");
    expect(restored.revisions).toHaveLength(3);
    expect(restored.currentRevision.number).toBe(3);
    expect(restored.currentRevision.beats).toEqual(base);
    expect(restored.approval).toBeUndefined();
    expect(restored.currentRevision.reason).toContain("unapproved");
    expect(r2.revisions).toHaveLength(2);
    expect(approved.currentRevision.beats).toEqual(base);
  });
  it("never silently restores a missing or already-current version",()=>{
    const script=first();
    expect(()=>restorePersonaScenarioRevision(script,"missing","2026-10-30T17:03:00Z")).toThrow("not found");
    expect(()=>restorePersonaScenarioRevision(script,script.currentRevisionId,"2026-10-30T17:03:00Z")).toThrow("already");
  });
});


describe("Creative concept history is part of a script revision",()=>{
 it("switches premise without changing project identity or losing the prior dramatic idea",()=>{
  const original=first();
  const alternativeIdea:ScenarioIdea={...idea,title:"Не тот саундтрек",
   originalConflict:"Музыка превращает романтическую сцену в триллер.",
   actingTask:"Удержать серьёзную игру несмотря на неверную музыкальную окраску.",
   ending:"Герой теряет уверенность от тревожного аккорда."};
  const alternativeBeats:ScenarioScriptBeat[]=[
   {purpose:"hook",line:"Я тебя нашёл.",action:"Тянется к невидимому партнёру.",durationSec:3},
   {purpose:"development",line:"Почему так страшно?",action:"Прерывает сцену и слушает музыку.",durationSec:5},
   {purpose:"ending",line:"А мы точно выживем?",action:"Смотрит на клавиши и отступает.",durationSec:5}
  ];
  const alt=reviseScenarioScript(original,{
   idea:alternativeIdea,beats:alternativeBeats,
   reason:"Новый драматургический механизм",
   createdAt:"2026-11-05T16:10:00.000Z"
  });
  expect(alt.idea.id).toBe(original.idea.id);
  expect(alt.idea.title).toBe("Не тот саундтрек");
  expect(alt.currentRevision.ideaSnapshot?.title).toBe("Не тот саундтрек");
  expect(alt.revisions[0].ideaSnapshot?.title).toBe("Репетиция");
  expect(alt.revisions[0].beats).toEqual(base);
  expect(alt.approval).toBeUndefined();
  const altEdited=reviseScenarioScript(alt,{reason:"Правка мизансцены",
   createdAt:"2026-11-05T16:11:00.000Z",
   beats:alternativeBeats.map((beat,i)=>i===2?{
    ...beat,action:"Смотрит на клавиши и выжидает паузу."
   }:beat)});
  expect(altEdited.currentRevision.ideaSnapshot?.title).toBe("Не тот саундтрек");
  const restored=restorePersonaScenarioRevision(altEdited,original.currentRevisionId,
   "2026-11-05T16:12:00.000Z");
  expect(restored.idea.title).toBe("Репетиция");
  expect(restored.idea.originalConflict).toBe(idea.originalConflict);
  expect(restored.currentRevision.ideaSnapshot?.title).toBe("Репетиция");
  expect(restored.currentRevision.beats).toEqual(base);
  expect(restored.revisions).toHaveLength(4);
  expect(restored.approval).toBeUndefined();
  expect(altEdited.idea.title).toBe("Не тот саундтрек");
 });
});
