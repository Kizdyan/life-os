import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import PersonaFactory, { PersonaProductionBriefPanel, buildPersonaProductionWorkflow, ideaForImportedBrief, selectedPersonaProjectSnapshot, personaScenarioWorkspaceMountKey, productionBriefMatchesBeats, canNavigateFromPersonaGuide, registerPersonaExitFlush } from './PersonaFactory';
import {productionBriefSnapshot,saveProductionInputDraft} from './personaProductionInputJournal';
import { createPersonaProject, type PersonaProjectCollection } from './personaProjectStore';

const quick={id:'local-project',title:'Новый Reels',angle:'Создать материал из собственных исходников',format:'reel' as const,score:0,source:'quick-start'};
const candidate={sourceTitle:'Один день между театром и музыкой',sourceAngle:'Две профессии одной историей',sourceFormat:'reel'};

describe('guide failed-save navigation safety',()=>{
 it('blocks navigation while an unsaved plan exists and permits it only after save or explicit discard',()=>{
  expect(canNavigateFromPersonaGuide(true)).toBe(false);
  expect(canNavigateFromPersonaGuide(false)).toBe(true);
 });
});
describe('production approval must follow latest current dialogue',()=>{
 it('refuses a changed line or timing while keeping legacy brief-only projects compatible',()=>{
  const prod=buildPersonaProductionWorkflow({id:'script-sync',title:'Сценка',angle:'Две роли',format:'reel',score:0});
  const brief=prod.materials.productionBrief!;
  expect(productionBriefMatchesBeats(brief,undefined)).toBe(true);
  const current=brief.script.map(beat=>({line:beat.line,action:beat.action,durationSec:beat.durationSec}));
  expect(productionBriefMatchesBeats(brief,current)).toBe(true);
  expect(productionBriefMatchesBeats(brief,current.map((beat,i)=>i===0?{...beat,line:'Новая реплика'}:beat))).toBe(false);
  expect(productionBriefMatchesBeats(brief,current.map((beat,i)=>i===0?{...beat,durationSec:beat.durationSec+1}:beat))).toBe(false);
  expect(productionBriefMatchesBeats(brief,[...current,{...current[0]}])).toBe(false);
 });
});
describe('brief import identity',()=>{
 it('lets an empty quick-start project adopt a validated candidate identity without changing its project ID',()=>{
  expect(ideaForImportedBrief(quick,candidate,true)).toMatchObject({id:'local-project',title:candidate.sourceTitle,angle:candidate.sourceAngle,format:'reel',source:'imported-brief'});
 });
 it('does not relabel a project that already contains work or malformed imported data',()=>{
  expect(ideaForImportedBrief(quick,candidate,false)).toBe(quick);
  expect(ideaForImportedBrief(quick,{sourceTitle:'Другой'},true)).toBe(quick);
 });
});

describe('scenario editor instance identity',()=>{
 it('resets editor-local state across project, idea and source-revision changes',()=>{
  const base={script:{idea:{id:'idea-a'},currentRevisionId:'revision-1'}} as any;
  const key=personaScenarioWorkspaceMountKey('project-a',base);
  expect(personaScenarioWorkspaceMountKey('project-b',base)).not.toBe(key);
  expect(personaScenarioWorkspaceMountKey('project-a',{script:{idea:{id:'idea-b'},currentRevisionId:'revision-1'}} as any)).not.toBe(key);
  expect(personaScenarioWorkspaceMountKey('project-a',{script:{idea:{id:'idea-a'},currentRevisionId:'revision-2'}} as any)).not.toBe(key);
  expect(personaScenarioWorkspaceMountKey('project-a',base)).toBe(key);
 });
});

describe('persisted Persona project selection',()=>{
 it('uses the current stored revision even when a project card holds an older object',()=>{
  const stale=createPersonaProject({id:'p1',title:'Актёр и композитор',contentType:'reel',sourceIdea:'Музыка и театр',now:'2026-10-31T10:00:00.000Z'});
  const current={...stale,revision:stale.revision+2,title:'Новая версия',
   scenarioWorkspace:{version:1 as const,research:[],analyses:[],ideas:[],selectedIdeaId:'latest'}};
  const persisted:PersonaProjectCollection={schemaVersion:1,activeProjectId:'p1',projects:[current]};
  expect(stale.revision).toBeLessThan(current.revision);
  expect(selectedPersonaProjectSnapshot(persisted,stale.id)).toBe(current);
  expect(selectedPersonaProjectSnapshot(persisted,stale.id).scenarioWorkspace?.selectedIdeaId).toBe('latest');
 });
 it('rejects an id missing from the actual store instead of opening a stale card',()=>{
  const collection:PersonaProjectCollection={schemaVersion:1,activeProjectId:null,projects:[]};
  expect(()=>selectedPersonaProjectSnapshot(collection,'deleted-project')).toThrow('unknown_persona_project');
 });
});

describe('Production Brief recovery UI',()=>{
 const pipeline=buildPersonaProductionWorkflow({id:'idea-1',title:'Первый Reel',angle:'Сценка актёра',format:'reel',score:0});
 const brief=pipeline.materials.productionBrief!;
 const storage=()=>{
  const entries=new Map<string,string>();
  return {getItem:(key:string)=>entries.get(key)??null,
   setItem:(key:string,value:string)=>{entries.set(key,value)},
   removeItem:(key:string)=>{entries.delete(key)}};
 };
 const renderPanel=(store:ReturnType<typeof storage>)=>{
  vi.stubGlobal('window',{localStorage:store});
  try{
   return renderToString(React.createElement(PersonaProductionBriefPanel,{
    projectId:'project-1',pipeline,editor:'Автор',comment:'Можно снимать',factsChecked:true,
    onEditorChange:()=>undefined,onCommentChange:()=>undefined,onFactsCheckedChange:()=>undefined,
    onDecision:()=>undefined,onRebuild:()=>undefined,onAngleChange:()=>undefined,onBriefChange:()=>true,
   }));
  }finally{vi.unstubAllGlobals()}
 };
 it('does not show recovery controls on an untouched production brief',()=>{
  const markup=renderPanel(storage());
  expect(markup).not.toContain('Проверить и сохранить восстановленную правку');
  expect(markup).toContain('Редактировать реплику 1');
 });
 it('renders the exact unblurred text after reload without applying it automatically',()=>{
  const s=storage(),value='Автор ещё набирает новую реплику';
  saveProductionInputDraft(s,{version:1,projectId:'project-1',ideaId:brief.ideaId,base:productionBriefSnapshot(brief),field:'script:0:line',value},null);
  const markup=renderPanel(s);
  expect(markup).toContain(value);
  expect(markup).toContain('Проверить и сохранить восстановленную правку');
  expect(markup).toContain('Страховочная копия незавершённой правки');
 });
 it('keeps an earlier-revision draft visible, but not automatically recoverable',()=>{
  const s=storage();
  saveProductionInputDraft(s,{version:1,projectId:'project-1',ideaId:brief.ideaId,base:'previous-version',field:'script:0:line',value:'Старая реплика'},null);
  const markup=renderPanel(s);
  expect(markup).toContain('Старая реплика');
  expect(markup).toContain('Несохранённый текст из другой версии');
  expect(markup).not.toContain('Проверить и сохранить восстановленную правку');
 });
});

describe('Persona save-on-exit wiring',()=>{
 it('flushes on pagehide and hidden-tab transitions but not while visible',()=>{
  const targetWindow=new EventTarget();
  const targetDocument=new EventTarget() as EventTarget & {visibilityState:DocumentVisibilityState};
  targetDocument.visibilityState='visible';
  const flush=vi.fn();
  const unregister=registerPersonaExitFlush(targetWindow as unknown as Window,targetDocument as unknown as Document,flush);
  targetDocument.dispatchEvent(new Event('visibilitychange'));
  expect(flush).toHaveBeenCalledTimes(0);
  targetDocument.visibilityState='hidden';
  targetDocument.dispatchEvent(new Event('visibilitychange'));
  expect(flush).toHaveBeenCalledTimes(1);
  targetWindow.dispatchEvent(new Event('pagehide'));
  expect(flush).toHaveBeenCalledTimes(2);
  unregister();
  targetWindow.dispatchEvent(new Event('pagehide'));
  targetDocument.dispatchEvent(new Event('visibilitychange'));
  expect(flush).toHaveBeenCalledTimes(2);
 });
});

describe('Persona empty workspace server rendering',()=>{
 it('renders without window, location or localStorage (no browser globals)',()=>{
  const oldWindow=globalThis.window;
  const oldLocation=globalThis.location;
  const oldLocalStorage=globalThis.localStorage;
  try{
   vi.stubGlobal('window',undefined);
   vi.stubGlobal('location',undefined);
   vi.stubGlobal('localStorage',undefined);
   expect(()=>renderToString(React.createElement(PersonaFactory))).not.toThrow();
  }finally{
   vi.stubGlobal('window',oldWindow);
   vi.stubGlobal('location',oldLocation);
   vi.stubGlobal('localStorage',oldLocalStorage);
   vi.unstubAllGlobals();
  }
 });
});
