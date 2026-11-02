import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {importPersonaProductionBrief,recordPersonaEditorialDecision} from '../../../packages/core/src/persona-production-pipeline';
import {assessPersonaLocalHandoff,PersonaLocalProductionHandoff} from './PersonaLocalProductionHandoff';

const fixture=JSON.parse(readFileSync(new URL('../../../docs/persona-delivery/editorial-candidate-production-brief.json',import.meta.url),'utf8'));
const pending=()=>importPersonaProductionBrief({brief:fixture});
const approved=()=>recordPersonaEditorialDecision(pending(),{
 decision:'approved',editor:'Автор',comment:'Для теста экспорта',factReviewCompleted:true,decidedAt:'2026-11-01T00:00:00Z',
});

describe('Persona local production handoff',()=>{
 it('keeps the unapproved editorial candidate locked, even with seven scenes',()=>{
  const candidate=pending();
  expect(candidate.materials.productionBrief?.script).toHaveLength(7);
  expect(assessPersonaLocalHandoff(candidate,false).allowed).toBe(false);
  expect(assessPersonaLocalHandoff(candidate,false).reason).toMatch(/одобрите/);
 });
 it('exports the exact approved 7-scene brief and does not mutate the project',()=>{
  const candidate=approved();
  const before=JSON.stringify(candidate);
  const result=assessPersonaLocalHandoff(candidate,false);
  expect(result.allowed).toBe(true);
  expect(result.brief).toBe(candidate.materials.productionBrief);
  expect(JSON.stringify(candidate)).toBe(before);
  expect(result.brief?.script).toHaveLength(7);
 });
 it('refuses pending input, stale idea and non-seven-scene drafts',()=>{
  const candidate=approved();
  expect(assessPersonaLocalHandoff(candidate,true).allowed).toBe(false);
  const stale={...candidate,input:{...candidate.input,idea:{...candidate.input.idea,angle:'другой смысл'}}};
  expect(assessPersonaLocalHandoff(stale,false).allowed).toBe(false);
  const invalid={...candidate,materials:{...candidate.materials,productionBrief:{
   ...candidate.materials.productionBrief!,script:candidate.materials.productionBrief!.script.slice(0,6),
  }}};
  expect(assessPersonaLocalHandoff(invalid,false).allowed).toBe(false);
 });
 it('renders on the server without window and does not pretend to launch local FFmpeg',()=>{
  const html=renderToString(React.createElement(PersonaLocalProductionHandoff,{projectId:'test-project',pipeline:approved(),hasUnsavedDraft:false}));
  expect(html).toContain('Скачать JSON для локального монтажа');
  expect(html).toContain('npm run media:first-reel:draft');
  expect(html).toContain('не запуск монтажа');
  const blocked=renderToString(React.createElement(PersonaLocalProductionHandoff,{projectId:'test-project',pipeline:pending(),hasUnsavedDraft:false}));
  expect(blocked).toContain('disabled');
 });
});
