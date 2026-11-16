import {describe,it,expect} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createPersonaProject} from './personaProjectStore';
import {creativeProjectAction} from './personaCreativeStudio';
import {PersonaCreativeProjectCard} from './PersonaCreativeProjectCard';
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
