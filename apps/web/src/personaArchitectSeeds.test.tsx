import {describe,it,expect} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createPersonaProject,loadPersonaProjects,savePersonaProject,PERSONA_PROJECTS_KEY,type PersonaProjectStorage} from './personaProjectStore';
import {PersonaCreativeProjectCard} from './PersonaCreativeProjectCard';
import {seedArchitectProjectsInBrowser,buildArchitectProductionBrief,PERSONA_ARCHITECT_IDS,PERSONA_ARCHITECT_IMPORT_HASH} from './personaArchitectSeeds';
import data from '../../../packages/core/src/persona-architect-ten-reels.json';
import {isPersonaStrategy,strategyForArchitect} from '../../../packages/core/src/persona-strategy.mjs';

function memoryStorage():PersonaProjectStorage{
 const values=new Map<string,string>();
 return {getItem:k=>values.get(k)??null,setItem:(k,v)=>{values.set(k,v)},removeItem:k=>{values.delete(k)}};
}
describe('Persona Architect 10 Reel browser import',()=>{
 it('imports all 10 projects, five shots each, with source music and B-roll and no false approvals',()=>{
  const storage=memoryStorage(),now='2026-11-16T12:00:00.000Z';
  const authorOwned=createPersonaProject({id:'real-project',title:'Own video',contentType:'reel',sourceIdea:'My original work',now});
  savePersonaProject(storage,authorOwned,authorOwned.id);
  const result=seedArchitectProjectsInBrowser(storage,now);
  expect(result.created).toBe(10);
  expect(result.skipped).toBe(0);
  expect(result.collection.activeProjectId).toBe(authorOwned.id);
  expect(result.collection.projects).toHaveLength(11);
  expect(result.collection.projects[0]).toEqual(authorOwned);
  expect(PERSONA_ARCHITECT_IMPORT_HASH).toBe('#persona/seed10');
  for(const [index,id] of PERSONA_ARCHITECT_IDS.entries()){
   const item=result.collection.projects.find(p=>p.id===id)!;
   expect(item.title).toBe(data[index].title);
   expect(item.contentType).toBe('reel');
   expect(item.stage).toBe('needs_assets');
   expect(isPersonaStrategy(item.strategy)).toBe(true);
   expect(item.strategy).toEqual(strategyForArchitect(data[index]));
   expect(item.lastOpenStep).toBe('script');
   expect(item.mediaAssets).toEqual([]);
   expect((item as any).architectSeed).toMatchObject({plannedStatus:'WAITING_FOR_FOOTAGE',synchronizedWithWorker:false});
   expect(item.shootingPlan).toMatchObject({stage:'QA',statuses:{READY_FOR_SHOOT:'pending'}});
   expect((item.shootingPlan as any).materials.shotList).toHaveLength(5);
   expect((item.shootingPlan as any).materials.productionBrief.capture.audio.recording).toContain(data[index].music);
   expect((item.shootingPlan as any).materials.productionBrief.postProduction.transitions).toContain(data[index].broll);
   expect(item.scenarioWorkspace?.script?.currentRevision.beats).toHaveLength(5);
   expect(item.scenarioWorkspace?.script?.currentRevision.beats[0].line).toBe(data[index].hook);
   const html=renderToStaticMarkup(<PersonaCreativeProjectCard project={item} onContinue={()=>{}}/>);
   expect(html).toContain('Продолжить сценарий');
  }
  expect(loadPersonaProjects(storage,()=> 'unused').projects).toHaveLength(11);
  expect(storage.getItem(PERSONA_PROJECTS_KEY)).not.toBeNull();
 });
 it('is idempotent and never overwrites an authored revision or a colliding user project',()=>{
  const storage=memoryStorage();
  const existing=createPersonaProject({id:'reel-01',title:'I already own this id',contentType:'reel',
   sourceIdea:'My genuine previous work',now:'2026-11-16T12:00:00.000Z'});
  savePersonaProject(storage,existing,existing.id);
  const first=seedArchitectProjectsInBrowser(storage);
  expect(first.created).toBe(9);
  expect(first.skipped).toBe(1);
  expect(first.collection.projects.find(p=>p.id==='reel-01')).toEqual(existing);
  const edited={...first.collection.projects.find(p=>p.id==='reel-02')!,title:'Author revision',revision:2};
  savePersonaProject(storage,edited,first.collection.activeProjectId??edited.id);
  const snapshot=storage.getItem(PERSONA_PROJECTS_KEY);
  const second=seedArchitectProjectsInBrowser(storage);
  expect(second.created).toBe(0);
  expect(second.skipped).toBe(10);
  expect(storage.getItem(PERSONA_PROJECTS_KEY)).toBe(snapshot);
  expect(second.collection.projects.find(p=>p.id==='reel-02')!.title).toBe('Author revision');
 });
 it('enriches only provenance-matching legacy seed records without rewriting author edits',()=>{
  const storage=memoryStorage();
  const original=seedArchitectProjectsInBrowser(storage).collection;
  const seed=original.projects.find(p=>p.id==='reel-01')!;
  const modified={...seed,revision:seed.revision+1};
  delete modified.strategy;
  savePersonaProject(storage,modified,original.activeProjectId!);
  const upgraded=seedArchitectProjectsInBrowser(storage);
  expect(upgraded.created).toBe(0);
  expect(upgraded.upgraded).toBe(1);
  expect(upgraded.collection.projects.find(p=>p.id==='reel-01')?.strategy).toEqual(strategyForArchitect(data[0]));
  expect(upgraded.collection.projects.find(p=>p.id==='reel-01')?.revision).toBe(modified.revision+1);
 });
 it('retains exact original timed descriptions without inventing lines or media',()=>{
  for(const source of data){
   const brief=buildArchitectProductionBrief(source);
   expect(brief.hook.firstSeconds).toBe(source.hook);
   expect(brief.shots).toHaveLength(5);
   expect(brief.factReferences).toEqual([]);
   expect(brief.postProduction.transitions).toContain(source.mainShots);
  }
 });
});
