import {describe, expect, it} from "vitest";
import {
  approveScenarioScript,
  createScenarioScript,
  type ScenarioIdea,
  type ScenarioScript,
  type ScenarioScriptBeat,
} from "./persona-scenario-intelligence";
import {applyPersonaLocalDoctorSuggestion} from "./persona-local-script-doctor-handoff";

const idea: ScenarioIdea = {
  id:"idea-for-doctor",
  title:"Музыкальные кинопробы",
  originalConflict:"Актёр хочет роль, режиссёр требует неожиданную музыкальную задачу.",
  referenceIds:[],
  actingTask:"Скрыть растерянность и всё-таки договориться.",
  ending:"Герой обнаруживает, что сдавал пробу всё время.",
  productionComplexity:"low",
  estimatedDurationSec:25,
  creativeProfileFit:"Фортепиано и актёрская игра.",
};
const beats: ScenarioScriptBeat[] = [
  {purpose:"hook",line:"Меня вызвали на кинопробы с пианино.",action:"Вхожу в кабинет и закрываю дверь.",durationSec:4},
  {purpose:"development",line:"Режиссёр просит сыграть тишину.",action:"Медленно поднимаю руки над клавишами.",durationSec:6},
  {purpose:"development",line:"Мне даже ноту нельзя взять.",action:"Стараюсь договориться и сдерживаю раздражение.",durationSec:5},
  {purpose:"ending",line:"Тишину взяли на главную роль.",action:"Встаю и уступаю место инструменту.",durationSec:4},
];
function original(): ScenarioScript {
  const script=createScenarioScript(idea,{createdAt:"2026-10-30T15:00:00.000Z",beats});
  return approveScenarioScript(script,{author:"Test author",comment:"Test approval",approvedAt:"2026-10-30T15:01:00.000Z"});
}
function candidate(script: ScenarioScript){
  const after:ScenarioScriptBeat={...beats[3],
    line:"Меня взяли. Теперь я аккомпаниатор тишины.",
    action:"Сажусь сбоку от пустого рояля и начинаю дирижировать паузой."};
  return {
    kind:"persona-local-doctor-suggestion-v1",
    version:1,
    sourceRevisionId:script.currentRevisionId,
    status:"SUGGESTION_NOT_APPROVED",
    revisedBeats:[...script.currentRevision.beats.slice(0,3),after],
    diff:[{beatIndex:3,before:script.currentRevision.beats[3],after}],
    changeSummary:"Финал стал активным действием героя.",
  };
}
describe("Persona local Script Doctor proposal import",()=>{
  it("archives old approved revision and creates a new UNAPPROVED one",()=>{
    const source=original();
    const result=applyPersonaLocalDoctorSuggestion(source,candidate(source),"2026-10-30T15:05:00.000Z");
    expect(source.approval?.revisionId).toBe(source.currentRevisionId);
    expect(result.approval).toBeUndefined();
    expect(result.revisions).toHaveLength(2);
    expect(result.currentRevision.number).toBe(2);
    expect(result.currentRevision.beats[0]).toEqual(source.currentRevision.beats[0]);
    expect(result.currentRevision.beats[3].line).toContain("аккомпаниатор");
    expect(result.currentRevision.reason).toContain("unapproved");
  });
  it("rejects stale AI revisions and invalid or fake approvals",()=>{
    const source=original(),suggestion=candidate(source);
    expect(()=>applyPersonaLocalDoctorSuggestion(source,{...suggestion,sourceRevisionId:"old-revision"},"2026-10-30T15:05:00Z")).toThrow("another revision");
    expect(()=>applyPersonaLocalDoctorSuggestion(source,{...suggestion,status:"approved"},"2026-10-30T15:05:00Z")).toThrow("another revision");
  });
  it("rejects hidden modifications outside the diff and altered author source",()=>{
    const source=original(),suggestion=candidate(source);
    expect(()=>applyPersonaLocalDoctorSuggestion(source,{...suggestion,
      revisedBeats:suggestion.revisedBeats.map((beat,index)=>index===0?{...beat,line:"Тихо изменили исходный хук."}:beat)
    },"2026-10-30T15:05:00Z")).toThrow("undisclosed");
    expect(()=>applyPersonaLocalDoctorSuggestion(source,{...suggestion,diff:[{
      ...suggestion.diff[0],before:{...suggestion.diff[0].before,line:"Придуманная прежняя реплика"}
    }]},"2026-10-30T15:05:00Z")).toThrow("diff does not match");
  });
  it("rejects repeated or missing changed entries and wrong narrative roles",()=>{
    const source=original(),suggestion=candidate(source);
    expect(()=>applyPersonaLocalDoctorSuggestion(source,{...suggestion,diff:[...suggestion.diff,...suggestion.diff]},"2026-10-30T15:05:00Z")).toThrow("change index");
    expect(()=>applyPersonaLocalDoctorSuggestion(source,{...suggestion,revisedBeats:suggestion.revisedBeats.map((beat,index)=>index===3?{...beat,purpose:"development"}:beat)},"2026-10-30T15:05:00Z")).toThrow("narrative role");
  });
});
