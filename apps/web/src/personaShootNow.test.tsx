import React from 'react';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {PersonaShootNow} from './PersonaShootNow.tsx';
import {buildPersonaShootPlan,makeShootSheet,markShootTake,readShootProgress,shootPlanFingerprint,shootProgressKey,shootTimecode} from './personaShootNow';
import {exampleActorComposerBeats} from './personaProductionGuide';
import type {PersonaScenarioWorkspace} from './personaProjectStore';

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
