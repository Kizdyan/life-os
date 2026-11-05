import React from 'react';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {PersonaShootNow} from './PersonaShootNow.tsx';
import {buildPersonaShootPlan,isScenarioCreativeApprovedForShooting,makeShootSheet,markShootTake,readShootProgress,shootPlanFingerprint,shootProgressKey,shootTimecode} from './personaShootNow';
import {createActorComposerWorkingBrief,createPersonaProductionGuide,exampleActorComposerBeats} from './personaProductionGuide';
import type {PersonaProductionPipeline} from '../../../packages/core/src/persona-production-pipeline';
import type {PersonaProductionBrief} from '../../../packages/core/src/persona-production-brief';
import type {PersonaScenarioWorkspace} from './personaProjectStore';
import {approveScenarioScript,reviseScenarioScript} from '../../../packages/core/src/persona-scenario-intelligence';
import {personaFirstReelConcepts,stagePersonaCreativeConcept} from './personaCreativeDevelopment';

const canonicalFirstReel=JSON.parse(readFileSync(
 new URL('../../../docs/persona-first-reel-production-brief-2026-10-29.json',import.meta.url),'utf8',
)) as {script:Array<{durationSec:number;line:string;action:string}>};

const preset={
 title:'Актёр и композитор',
 workspace:undefined,pipeline:null,allowPilot:true,
} as const;

describe('Persona model-provenance visibility',()=>{
 it('shows the actual AI model for the current revision but never claims to render video',()=>{
  const plan=buildPersonaShootPlan(preset);
  const meta={version:1 as const,provider:'ollama' as const,model:'qwen3:4b-instruct',
   variation:'cinematic' as const,revisionId:'ai-revision',createdAt:'2026-11-03T14:00:00.000Z'};
  const view=renderToStaticMarkup(<PersonaShootNow projectId="test-ai" plan={plan}
   onOpenScript={()=>{}} generation={meta} generationCurrent={true}/>);
  expect(view).toContain('создан настоящей моделью');
  expect(view).toContain('qwen3:4b-instruct');
  expect(view).toContain('не выполненного монтажа');
  const later=renderToStaticMarkup(<PersonaShootNow projectId="test-ai" plan={plan}
   onOpenScript={()=>{}} generation={meta} generationCurrent={false}/>);
  expect(later).toContain('Сценарий после генерации редактировался');
 });
});

describe('Persona direct filming experience',()=>{
 it('keeps the opt-in shooting page verbatim with the canonical approved seven-scene brief',()=>{
  expect(exampleActorComposerBeats.map(({seconds,line,action})=>({seconds,line,action}))).toEqual(
   canonicalFirstReel.script.map(({durationSec,line,action})=>({seconds:durationSec,line,action})),
  );
 });
 it('shows a real seven-scene shoot-ready EXAMPLE with lines, camera, acting and montage cues',()=>{
  const plan=buildPersonaShootPlan(preset);
  expect(plan.status).toBe('example');
  expect(plan.scenes).toHaveLength(7);
  expect(plan.scenes.map(s=>s.line)).toEqual(exampleActorComposerBeats.map(s=>s.line));
  expect(plan.scenes[0].line).toBe('Я актёр. И ещё пишу музыку.');
  expect(plan.scenes[0].camera).toContain('Штатив');
  expect(plan.scenes[6].performance).toContain('панчлайн');
  expect(plan.scenes[0].sourceFileName).toContain('A01');
  expect(plan.scenes.reduce((sum,s)=>sum+s.seconds,0)).toBe(31);
  expect(shootTimecode(plan,6)).toBe('00:27');
  const html=renderToStaticMarkup(<PersonaShootNow projectId="test-pilot" plan={plan}
   onOpenScript={()=>{}} onSavePilot={()=>{}}/>);
  expect(html).toContain('Сначала доведём сценарий до съёмки');
  expect(html).toContain('СКАЖИ В КАДРЕ');
  expect(html).toContain('Я актёр. И ещё пишу музыку.');
  expect(html).toContain('Как поставить камеру');
  expect(html).toContain('Сохранить старый пример как неутверждённый черновик');
  expect(html).toContain('Публикация не разрешена автоматически');
 });
 it('keeps the pre-edit cues consistent with the approved words and B03 music range',()=>{
  const plan=buildPersonaShootPlan(preset);
  expect(plan.scenes[2].edit).toContain('«текст»');
  expect(plan.scenes[5].edit).toContain('2–3 секунды');
  expect(plan.scenes[5].edit).not.toContain('2,12');
 });
 it('does not pretend an unknown project has invented scenes',()=>{
  const plan=buildPersonaShootPlan({...preset,title:'Собственный Reels',allowPilot:false});
  expect(plan.status).toBe('draft');
  expect(plan.scenes).toHaveLength(0);
  const html=renderToStaticMarkup(<PersonaShootNow projectId="empty" plan={plan} onOpenScript={()=>{}}/>);
  expect(html).toContain('пока нет реплик и кадров');
  expect(html).not.toContain('Я актёр. И ещё пишу музыку.');
  expect(html).toContain('Составить сценарий и кадры');
 });
 it('never substitutes sample dialogue after author edits a scene',()=>{
  const script={currentRevisionId:'revision-x',currentRevision:{
   beats:[{order:1,durationSec:4,line:'Моя собственная новая реплика',action:'Повернуть голову'}],
  }} as unknown as PersonaScenarioWorkspace['script'];
  const plan=buildPersonaShootPlan({...preset,
   workspace:{version:1,research:[],analyses:[],ideas:[],script} as PersonaScenarioWorkspace,
  });
  expect(plan.status).toBe('draft');
  expect(plan.scenes).toHaveLength(1);
  expect(plan.scenes[0].line).toBe('Моя собственная новая реплика');
  expect(plan.scenes[0].camera).not.toContain('ориентир 0,9');
  expect(plan.scenes[0].sourceFileName).toBe('S01_take01.mp4');
  expect(plan.scenes[0].sourceFileName).not.toContain('A01');
 });
 it('tracks takes only for approved projects and invalidates on changed script or status',()=>{
  const example=buildPersonaShootPlan(preset);
  const plan={...example,status:'approved' as const};
  expect(readShootProgress({version:1,fingerprint:shootPlanFingerprint(plan),
   completedIds:['A01'],updatedAt:'2026-11-03T15:00:00.000Z'},example)).toBeNull();
  expect(()=>markShootTake(example,null,'A01',true,'2026-11-03T15:00:00.000Z'))
   .toThrow(/unapproved shooting plan/);
  expect(shootPlanFingerprint(example)).not.toBe(shootPlanFingerprint(plan));
  const marked=markShootTake(plan,null,'A01',true,'2026-11-03T15:00:00.000Z');
  expect(marked.completedIds).toEqual(['A01']);
  expect(readShootProgress(marked,plan)).toEqual(marked);
  expect(readShootProgress(marked,{...plan,status:'draft'})).toBeNull();
  const more=markShootTake(plan,marked,'B01',true,'2026-11-03T15:01:00.000Z');
  expect(more.completedIds).toEqual(['A01','B01']);
  expect(markShootTake(plan,more,'A01',false,'2026-11-03T15:02:00.000Z').completedIds)
   .toEqual(['B01']);
  expect(readShootProgress(marked,{...plan,scenes:plan.scenes.map((s,i)=>
   i===0?{...s,line:'New beat'}:s)})).toBeNull();
  expect(()=>markShootTake(plan,marked,'unknown',true,'2026-11-03T15:00:00.000Z')).toThrow();
  expect(shootProgressKey('first')).not.toBe(shootProgressKey('second'));
  expect(makeShootSheet(plan)).toContain('Камера: Штатив');
  expect(makeShootSheet(example)).toContain('РАБОЧИЙ ПЛАН');
  expect(makeShootSheet(example)).toContain('сначала художественное утверждение');
  expect(makeShootSheet(plan)).toContain('Что снимать по порядку');
 });
});


it('does not let an unapproved example masquerade as a filming checklist',()=>{
 const example=buildPersonaShootPlan(preset);
 const html=renderToStaticMarkup(<PersonaShootNow projectId="creative-preproduction"
  plan={example} onOpenScript={()=>{}} onOpenEdit={()=>{}} onSavePilot={()=>{}}/>);
 expect(html).toContain('Сначала сценарий, потом съёмка');
 expect(html).toContain('Перейти к творческой проверке и сценарию');
 expect(html).toContain('Просмотри покадровый черновик');
 expect(html).not.toContain('Открыть реальные дубли в монтаже');
 expect(html).toContain('Отметки реальных дублей откроются только после утверждения');
 expect(html).toMatch(/type="checkbox"[^>]*disabled=""/);
 const signed=renderToStaticMarkup(<PersonaShootNow projectId="creative-approved"
  plan={{...example,status:'approved'}} onOpenScript={()=>{}} onOpenEdit={()=>{}}/>);
 expect(signed).toContain('2. Снимай кадры по порядку');
 expect(signed).toContain('Вот что снимать прямо сейчас');
 expect(signed).toContain('Открыть реальные дубли в монтаже');
 expect(signed).not.toContain('Сначала сценарий, потом съёмка');
 expect(signed).not.toMatch(/type="checkbox"[^>]*disabled=""/);
});


it('does not treat a structural-only or revoked creative approval as permission to shoot',()=>{
 const initial=stagePersonaCreativeConcept(
  {version:1,research:[],analyses:[],ideas:[]},personaFirstReelConcepts[0],
  '2026-11-05T16:00:00.000Z');
 const script=approveScenarioScript(initial.script!,{
  author:'Редактор',comment:'Проверка структуры пройдена, творческое решение отдельно.',
  approvedAt:'2026-11-05T16:01:00.000Z',
 });
 const workspace={...initial,script};
 expect(isScenarioCreativeApprovedForShooting(workspace)).toBe(false);
 const positive={revisionId:script.currentRevisionId,reviewer:'author' as const,
  decision:'ready_for_author' as const,
  comment:'Сценарий разобран на конфликт, актерское действие, музыку, начало и финал.',
  createdAt:'2026-11-05T16:02:00.000Z'};
 const accepted={...workspace,creativeReviews:[positive]};
 expect(isScenarioCreativeApprovedForShooting(accepted)).toBe(true);
 expect(isScenarioCreativeApprovedForShooting({...accepted,
  creativeReviews:[positive,{...positive,decision:'needs_revision',
   comment:'Пересмотрел решение: конфликт слишком слабый, музыкальный финал предсказуем.',
   createdAt:'2026-11-05T16:03:00.000Z'}]})).toBe(false);
 const newScript=reviseScenarioScript(script,{createdAt:'2026-11-05T16:04:00.000Z',
  reason:'Отдельная новая редакция',beats:script.currentRevision.beats.map((beat,i)=>
   i===1?{...beat,action:beat.action+' Герой отказывает собеседнику.'}:beat)});
 expect(isScenarioCreativeApprovedForShooting({...accepted,script:newScript})).toBe(false);
});


it('keeps exact revision-bound sound and cut directions for a new concept',()=>{
 const guide=createPersonaProductionGuide('2026-11-05T16:30:00.000Z','actor_composer');
 const original=createActorComposerWorkingBrief({id:'new-creative-concept',title:'Новый сценарий',
  angle:'Оригинальная музыка переворачивает сцену',format:'reel'},guide);
 const script=original.script.slice(0,3);
 const editIntents=script.map((beat,i)=>
  'Кадр '+(i+1)+': музыкальный акцент и склейка только на окончании произнесённых слов.');
 const brief={...original,script,shots:original.shots.slice(0,3),
  preEditPlan:{
   version:1,kind:'persona-pre-edit-plan-v1',status:'intent_only',
   origin:'scenario_revision',sourceRevisionId:'current-r3',
   researchEvidence:{level:'hypothesis_only',sourceUrls:[],note:'Творческий замысел, не измеренный тренд'},
   scenes:script.map((beat,i)=>({
    order:i+1,line:beat.line,durationSec:beat.durationSec,
    editIntent:editIntents[i],audioIntent:'Оригинальная музыка',
    subtitleIntent:'Субтитры только для речи',
    mediaStatus:'awaiting_author_footage',
   })),
   publicationApproved:false,
  },
 } as PersonaProductionBrief;
 const pipeline={stage:'QA',materials:{productionBrief:brief}} as PersonaProductionPipeline;
 const beats=script.map((beat,i)=>({...beat,
  purpose:i===0?'hook':i===script.length-1?'ending':'development'}));
 const workspace={version:1,research:[],analyses:[],ideas:[],preProductionGuide:guide,
  script:{currentRevisionId:'current-r3',currentRevision:{beats}}} as unknown as PersonaScenarioWorkspace;
 const plan=buildPersonaShootPlan({
  title:'Новый сценарий',workspace,pipeline,allowPilot:false});
 expect(plan.status).toBe('draft');
 expect(plan.scenes).toHaveLength(3);
 expect(plan.scenes.map(scene=>scene.edit)).toEqual(editIntents);
 expect(makeShootSheet(plan)).toContain(editIntents[1]);
 const stale=buildPersonaShootPlan({
  title:'Новый сценарий',
  workspace:{...workspace,script:{...workspace.script!,currentRevisionId:'changed-revision'}},
  pipeline,allowPilot:false});
 expect(stale.scenes.map(scene=>scene.edit)).not.toContain(editIntents[1]);
 expect(stale.scenes[1].edit).toBe(guide.fields.editing);
});


it('refuses stale pre-edit revisions or malformed creative evidence even when lines match',()=>{
 const guide=createPersonaProductionGuide('2026-11-05T17:10:00.000Z','actor_composer');
 const base=createActorComposerWorkingBrief({id:'revision-safe',title:'Актёр и композитор',
  angle:'Первый ролик',format:'reel'},guide);
 const currentId='scenario-r2';
 const brief:PersonaProductionBrief={...base,preEditPlan:{
  version:1,kind:'persona-pre-edit-plan-v1',status:'intent_only',
  origin:'scenario_revision',sourceRevisionId:currentId,
  researchEvidence:{level:'hypothesis_only',sourceUrls:[],note:'Только редакторский замысел'},
  scenes:base.script.map((scene,i)=>({
   order:scene.order,line:scene.line,durationSec:scene.durationSec,
   editIntent:'Кадр '+(i+1)+': точная проверенная склейка.',
   audioIntent:'Оригинальная музыка по утверждённой монтажной карте.',
   subtitleIntent:'Субтитры завершаются вместе с речью.',
   mediaStatus:'awaiting_author_footage',
  })),
  publicationApproved:false,
 }};
 const pipeline={stage:'READY_FOR_SHOOT',materials:{
  productionBrief:brief,editorialDecision:{decision:'approved'},
 }} as unknown as PersonaProductionPipeline;
 const script={currentRevisionId:currentId,currentRevision:{
  id:currentId,beats:brief.script.map((scene,i)=>({
   purpose:i===0?'hook':i===brief.script.length-1?'ending':'development',
   line:scene.line,action:scene.action,durationSec:scene.durationSec,
   editIntent:brief.preEditPlan.scenes[i].editIntent,
  })),
 },approval:{revisionId:currentId}};
 const decision={revisionId:currentId,reviewer:'author' as const,
  decision:'ready_for_author' as const,
  comment:'Принят весь сценарий: конфликт, игра, оригинальная музыка и финал.',
  createdAt:'2026-11-05T17:12:00.000Z'};
 const workspace={version:1,research:[],analyses:[],ideas:[],
  script,creativeReviews:[decision],preProductionGuide:guide,
 } as unknown as PersonaScenarioWorkspace;
 expect(isScenarioCreativeApprovedForShooting(workspace)).toBe(true);
 const approved=buildPersonaShootPlan({title:'Проверка',workspace,pipeline,allowPilot:false});
 expect(approved.status).toBe('approved');
 const stalePipeline={...pipeline,materials:{...pipeline.materials,productionBrief:{
  ...brief,preEditPlan:{...brief.preEditPlan,sourceRevisionId:'old-r1'},
 }}} as PersonaProductionPipeline;
 expect(buildPersonaShootPlan({title:'Проверка',workspace,pipeline:stalePipeline,
  allowPilot:false}).status).toBe('draft');
 const modifiedScript={...workspace,script:{...workspace.script!,
  currentRevision:{...workspace.script!.currentRevision,
   beats:workspace.script!.currentRevision.beats.map((beat,i)=>
    i===0?{...beat,editIntent:'Другая склейка и музыкальный акцент'}:beat),
  }}};
 expect(buildPersonaShootPlan({title:'Проверка',workspace:modifiedScript,
  pipeline,allowPilot:false}).status).toBe('draft');
 const malformed={...workspace,creativeReviews:[{...decision,comment:'кратко'}]};
 expect(isScenarioCreativeApprovedForShooting(malformed)).toBe(false);
 expect(buildPersonaShootPlan({title:'Проверка',workspace:malformed,
  pipeline,allowPilot:false}).status).toBe('draft');
});
