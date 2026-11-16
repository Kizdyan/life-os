import {describe,it,expect} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createPersonaProject} from './personaProjectStore';
import {creativeProjectAction} from './personaCreativeStudio';
import {PersonaCreativeProjectCard} from './PersonaCreativeProjectCard';
import {strategySnapshot} from '../../../packages/core/src/persona-strategy.mjs';
import PersonaPreparationStudio,{normalizePreparationScenes} from './PersonaPreparationStudio';

const sample=()=>createPersonaProject({
 id:'creative-card-test',title:'Актёр и композитор',contentType:'reel',
 sourceIdea:'Две роли',now:'2026-11-16T08:00:00.000Z',
});
describe('Persona Creative Studio dashboard',()=>{
 it('shows a single, actionable CTA with no invented live Worker status',()=>{
  const project={...sample(),lastOpenStep:'script'} as ReturnType<typeof sample>;
  expect(creativeProjectAction(project)).toMatchObject({action:'Продолжить сценарий',step:'script'});
  const html=renderToStaticMarkup(<PersonaCreativeProjectCard project={project} onContinue={()=>{}}/>);
  expect(html).toContain('Актёр и композитор');
  expect(html).toContain('Продолжить сценарий');
  expect((html.match(/<button/g)||[])).toHaveLength(1);
  expect(html).toContain('personaCreativeCover');
  expect(html).not.toContain('ProductionJob:');
 });
 it('renders seven descriptive tags and only current AI warnings',()=>{
  const project=sample();
  const snapshot=strategySnapshot(project);
  const warning={version:1 as const,status:'WARNING' as const,
   recommendation:'Слабо решает задачу профессионального позиционирования',
   snapshot,provider:'openai' as const,model:'test-model',checkedAt:'2026-11-16T12:00:00.000Z'};
  const html=renderToStaticMarkup(<PersonaCreativeProjectCard project={{...project,strategyAudit:warning}} onContinue={()=>{}}/>);
  expect(html).toContain('personaCreativeCard--strategyWarning');
  expect(html).toContain('Внимание: этот сценарий может не привлечь индустрию');
  expect(html).toContain('Семь элементов стратегии');
  expect((html.match(/aria-label="(Взгляд|Образ|Подача|Аудитория|Формат|Цель|Удержание):/g)||[])).toHaveLength(7);
  const stale=renderToStaticMarkup(<PersonaCreativeProjectCard project={{...project,sourceIdea:'Изменено',strategyAudit:warning}} onContinue={()=>{}}/>);
  expect(stale).not.toContain('personaCreativeCard--strategyWarning');
 });
 it('gives a review action only for validated saved media job evidence',()=>{
  const project=sample();
  expect(creativeProjectAction({...project,stage:'approval'}).action).toBe('Открыть план съёмки');
  expect(creativeProjectAction({...project,lastOpenStep:'edit'}).action).toBe('Открыть монтаж');
  expect(creativeProjectAction({...project,aiMediaJob:{status:'awaiting-author-review'} as any}).action).not.toBe('Проверить монтаж');
 });
});
describe('preparation storyboard safety',()=>{
 it('rejects invalid timings without fabricating footage',()=>{
  expect(normalizePreparationScenes([{line:'Проба',action:'Крупный план',durationSec:2}])).toHaveLength(1);
  expect(normalizePreparationScenes([{line:'Проба',action:'Крупный план',durationSec:0}])).toEqual([]);
  expect(normalizePreparationScenes([{line:'Проба',action:'Крупный план',durationSec:Infinity}])).toEqual([]);
 });
 it('renders a closed-by-default, non-publishing preparation entry',()=>{
  const html=renderToStaticMarkup(<PersonaPreparationStudio scenes={[{line:'Реплика',action:'Крупный план',durationSec:2}]}/>);
  expect(html).toContain('Режиссёрский аниматик');
  expect(html).toContain('Открыть аниматик');
  expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain('Воспроизвести');
 });
});
