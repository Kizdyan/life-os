import React from 'react';
import {describe,it,expect} from 'vitest';
import {renderToString} from 'react-dom/server';
import {buildPersonaProductionBrief} from '../../../packages/core/src/persona-production-brief';
import {evaluatePersonaProductionBrief} from '../../../packages/core/src/persona-production-qa';
import {importPersonaProductionBrief} from '../../../packages/core/src/persona-production-pipeline';
import {createPersonaProject,loadPersonaProjects,savePersonaProject} from './personaProjectStore';
import {PersonaProductionGuide} from './PersonaProductionGuide';
import {
 createPersonaProductionGuide,createActorComposerWorkingBrief,exportPersonaShootingSheet,guideProgress,
 productionGuideScenes,validatePersonaProductionGuide,
} from './personaProductionGuide';

const idea={id:'guide-1',title:'Актёр и композитор — колыбельная',angle:'Два срочных дела и комедийный музыкальный поворот',format:'reel' as const};
const now='2026-11-01T20:00:00.000Z';
const storage=()=>{
 const data=new Map<string,string>();
 return {getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value)},removeItem:(key:string)=>{data.delete(key)}};
};
describe('Persona full preproduction guide',()=>{
 it('renders a concrete, mobile-compatible shooting route, 7 exact lines, lighting and editing, with no false trends',()=>{
  const html=renderToString(<PersonaProductionGuide projectTitle={idea.title} projectAngle={idea.angle} allowExample={true}
   pipeline={null} onSave={()=>{}} onUseExample={()=>{}} onNavigate={()=>{}}/>);
  expect(html).toContain('От идеи до первого монтажа');
  expect(html).toContain('Я актёр. И ещё пишу музыку.');
  expect(html).toContain('Это колыбельная? Это финал триллера.');
  expect(html).toContain('Локация, камера, свет, звук');
  expect(html).toContain('Предварительный монтаж');
  expect(html).toContain('Подтверждённых референсов пока нет');
  expect(html).toContain('НЕ ПУБЛИКАЦИЯ');
  expect(html).toContain('Создать редактируемый сценарий из этих 7 сцен');
 });
 it('creates an unapproved 31-second candidate inside canonical production model, not a published reel',()=>{
  const guide=createPersonaProductionGuide(now);
  const brief=createActorComposerWorkingBrief(idea,guide);
  expect(brief.script).toHaveLength(7);
  expect(brief.shots).toHaveLength(7);
  expect(brief.shots.reduce((n,s)=>n+s.durationSec,0)).toBe(31);
  expect(brief.script[0].line).toBe('Я актёр. И ещё пишу музыку.');
  expect(brief.script[6].line).toBe('Это колыбельная? Это финал триллера.');
  const qa=evaluatePersonaProductionBrief({brief,allowedFacts:[]});
  expect(qa.structuralChecks.every(x=>x.passed)).toBe(true);
  const pipeline=importPersonaProductionBrief({brief,selectedIdea:idea});
  expect(pipeline.materials.editorialDecision).toBeUndefined();
  expect(pipeline.stage).toBe('QA');
  expect(pipeline.materials.qa?.editorialReview.state).toBe('pending');
 });
 it('exports every spoken line and setup decision without pretending the example was approved',()=>{
  const guide=createPersonaProductionGuide(now);
  guide.fields.location='Моя реально выбранная комната';
  const scenes=productionGuideScenes(null);
  const sheet=exportPersonaShootingSheet({title:idea.title,angle:idea.angle,guide,scenes,sample:true,references:[]});
  expect(sheet).toContain('Моя реально выбранная комната');
  expect(sheet).toContain('Это колыбельная? Это финал триллера.');
  expect(sheet).toContain('демонстрационный пример');
  expect(sheet).toContain('НЕ УТВЕРЖДЕНИЕ');
  expect(sheet).toContain('- [ ]');
  expect(sheet).not.toContain('РАЗРЕШЕНО ПУБЛИКОВАТЬ');
 });
 it('rejects unchecked, malformed guide records and keeps old projects valid',()=>{
  const guide=createPersonaProductionGuide(now);
  expect(validatePersonaProductionGuide(guide)).toBe(true);
  expect(validatePersonaProductionGuide({...guide,fields:{...guide.fields,camera:'a'.repeat(6001)}})).toBe(false);
  expect(validatePersonaProductionGuide({...guide,checks:{publishApproved:true}})).toBe(false);
  const project=createPersonaProject({id:idea.id,title:idea.title,contentType:'reel',sourceIdea:idea.angle,now});
  const store=storage();
  savePersonaProject(store,project,project.id);
  expect(loadPersonaProjects(store,()=>idea.id).projects[0].scenarioWorkspace).toBeUndefined();
  const withGuide={...project,revision:2,scenarioWorkspace:{version:1 as const,research:[],analyses:[],ideas:[],
   preProductionGuide:{...guide,checks:{set:true,lighting:true}}}};
  savePersonaProject(store,withGuide,withGuide.id);
  const loaded=loadPersonaProjects(store,()=>idea.id).projects[0];
  expect(guideProgress(loaded.scenarioWorkspace!.preProductionGuide!)).toBe(2);
  expect(loaded.scenarioWorkspace?.preProductionGuide?.fields.location).toBe(guide.fields.location);
 });
 it('shows current approved brief instead of substituting the seven-shot sample',()=>{
  const guide=createPersonaProductionGuide(now);
  const generic=buildPersonaProductionBrief({idea});
  const pipeline=importPersonaProductionBrief({brief:generic,selectedIdea:idea});
  const html=renderToString(<PersonaProductionGuide projectTitle={idea.title} projectAngle={idea.angle} allowExample={true}
   workspace={{version:1,research:[],analyses:[],ideas:[],preProductionGuide:guide}}
   pipeline={pipeline} onSave={()=>{}} onUseExample={()=>{}} onNavigate={()=>{}}/>);
  expect(html).not.toContain('Создать редактируемый сценарий из этих 7 сцен');
  expect(html).toContain(generic.script[0].line);
  expect(productionGuideScenes(generic)).toHaveLength(generic.script.length);
 });
});
