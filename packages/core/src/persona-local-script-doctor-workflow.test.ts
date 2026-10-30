import {describe, expect, it} from "vitest";
import {
  approveScenarioScript,
  createScenarioScript,
  type ScenarioIdea,
  type ScenarioScriptBeat,
} from "./persona-scenario-intelligence";
import {buildPersonaLocalDoctorTask} from "./persona-local-script-doctor-workflow";

const idea:ScenarioIdea={
  id:"demo-reel",title:"Необычная проба",referenceIds:[],
  originalConflict:"Актёр пытается доказать режиссёру, что способен сыграть молчание.",
  actingTask:"Убедить режиссёра через действие.",ending:"В финале герой получает неожиданную задачу.",
  productionComplexity:"low",estimatedDurationSec:25,creativeProfileFit:"Актёрская игра."
};
const beats:ScenarioScriptBeat[]=[
  {purpose:"hook",line:"Мне сказали: ничего не играйте.",action:"Сдерживаю движение руки.",durationSec:4},
  {purpose:"development",line:"Но я хотел показать роль.",action:"Пытаюсь убедить режиссёра жестом.",durationSec:6},
  {purpose:"development",line:"Вы уже всё показали.",action:"Останавливаюсь перед дверью.",durationSec:6},
  {purpose:"ending",line:"Оказывается, это была проба.",action:"Ухожу, не открывая дверь.",durationSec:4},
];
const makeScript=()=>approveScenarioScript(
  createScenarioScript(idea,{createdAt:"2026-10-30T19:00:00Z",beats}),
  {author:"Тестовый автор",comment:"Тестовое одобрение",
   approvedAt:"2026-10-30T19:02:00Z"}
);
describe("Persona local Script Doctor task export",()=>{
  it("exports only current script and editable scope, never the previous author approval",()=>{
    const script=makeScript();
    const exported=buildPersonaLocalDoctorTask(script,{
      targetIndices:[3,2],lockedIndices:[0],
      instruction:"Сделать финал менее предсказуемым и улучшить действия.",
      authorFeedback:"Сейчас поворот раскрывается заранее.",
      creativeProfile:{priorities:["точные действия","оригинальная музыка"],
        constraints:["не копировать чужие видео"]},
    });
    expect(exported.targetIndices).toEqual([2,3]);
    expect(exported.lockedIndices).toEqual([0]);
    expect("sourceRevisionId" in exported).toBe(false);
    expect(exported.script.currentRevisionId).toBe(script.currentRevisionId);
    expect(exported.script.currentRevision.beats).toEqual(beats);
    expect(exported.script).not.toHaveProperty("approval");
    expect(exported.script).not.toHaveProperty("revisions");
    expect(exported.creativeProfile?.constraints).toContain("не копировать чужие видео");
    expect(exported.authorFeedback).toContain("раскрывается");
    expect(exported.script.currentRevision.beats).not.toBe(script.currentRevision.beats);
  });
  it("rejects locked frames targeted for editing, duplicates and invalid instructions",()=>{
    const script=makeScript();
    expect(()=>buildPersonaLocalDoctorTask(script,{targetIndices:[0,2],lockedIndices:[0],
      instruction:"Сделать лучше"})).toThrow("locked");
    expect(()=>buildPersonaLocalDoctorTask(script,{targetIndices:[2,2],
      instruction:"Сделать лучше"})).toThrow("target");
    expect(()=>buildPersonaLocalDoctorTask(script,{targetIndices:[],
      instruction:"Сделать лучше"})).toThrow("target");
    expect(()=>buildPersonaLocalDoctorTask(script,{targetIndices:[3],instruction:"??"})).toThrow("instruction");
  });
  it("refuses stale revision references and leaves source immutable",()=>{
    const original=makeScript();
    const stale={...original,currentRevisionId:"stale"};
    expect(()=>buildPersonaLocalDoctorTask(stale,{
      targetIndices:[3],instruction:"Переписать финал"})).toThrow("save");
    const task=buildPersonaLocalDoctorTask(original,{targetIndices:[3],
      instruction:"Переписать финал"});
    task.script.currentRevision.beats[3].line="Только экспорт, оригинал не менять";
    expect(original.currentRevision.beats[3].line).toBe(beats[3].line);
  });
});
