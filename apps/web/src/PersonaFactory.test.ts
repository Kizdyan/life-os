import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import PersonaFactory, { ideaForImportedBrief, selectedPersonaProjectSnapshot, personaScenarioWorkspaceMountKey, registerPersonaExitFlush } from './PersonaFactory';
import { createPersonaProject, type PersonaProjectCollection } from './personaProjectStore';

const quick={id:'local-project',title:'Новый Reels',angle:'Создать материал из собственных исходников',format:'reel' as const,score:0,source:'quick-start'};
const candidate={sourceTitle:'Один день между театром и музыкой',sourceAngle:'Две профессии одной историей',sourceFormat:'reel'};

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
