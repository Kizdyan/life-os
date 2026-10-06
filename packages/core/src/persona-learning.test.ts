import { describe, expect, it } from 'vitest';
import { learnPersonaPreference, personaPlanForDate, personaPreferencesFromApprovals, rankPersonaCandidates, rankPersonaTopics } from './persona-learning';

describe('Persona learning mode',()=>{
 it('uses the weekly plan without asking what format is due',()=>{
  const plan=personaPlanForDate('2026-10-04T12:00:00+03:00');
  expect(plan.weekday).toBe(0);
  expect(plan.format).toBe('carousel');
 });
 it('turns user corrections into reusable preference weights',()=>{
  const memory=learnPersonaPreference([], {kind:'correction',key:'carousel:text_density',value:'low',accepted:true,at:'2026-10-04T12:00:00Z'});
  expect(memory[0]).toMatchObject({key:'carousel:text_density',value:'low'});
  expect(memory[0].weight).toBeGreaterThan(0);
 });
 it('ranks topics using both fit and learned preferences',()=>{
  const ranked=rankPersonaTopics([{id:'a',title:'Backstage репетиции',pillar:'actor',baseScore:70},{id:'b',title:'Как рождается музыка',pillar:'creator',baseScore:70}],[{key:'pillar',value:'creator',weight:12,evidenceCount:3,updatedAt:'2026-10-04T12:00:00Z'}]);
  expect(ranked[0].id).toBe('b');
 });
 it('re-ranks real candidates from learned topic and format signals without replacing their base score',()=>{
  const candidates=[{id:'a',title:'Репетиция',format:'reel',score:80},{id:'b',title:'Музыка',format:'carousel',score:82}];
  const memory=[{key:'format',value:'reel',weight:5,evidenceCount:2,updatedAt:'2026-10-04T12:00:00Z'},{key:'topic',value:'a',weight:2,evidenceCount:1,updatedAt:'2026-10-04T12:00:00Z'}];
  const ranked=rankPersonaCandidates(candidates,memory);
  expect(ranked.map(x=>x.id)).toEqual(['a','b']);
  expect(candidates[0].score).toBe(80);
 });
 it('derives topic and format ranking signals from canonical approval records without storing another decision state',()=>{
  const candidates=[{id:'a',title:'Репетиция',format:'reel',score:80},{id:'b',title:'Музыка',format:'carousel',score:82}];
  const memory=personaPreferencesFromApprovals(candidates,[
   {candidateId:'a',revision:1,decision:'approved',reason:null,decidedAt:'2026-10-04T12:00:00Z'},
   {candidateId:'b',revision:1,decision:'rejected',reason:'не моя тема',decidedAt:'2026-10-04T12:05:00Z'},
   {candidateId:'a',revision:2,decision:'rework',reason:'короче',decidedAt:'2026-10-04T12:10:00Z'},
  ]);
  expect(memory).toEqual(expect.arrayContaining([
   expect.objectContaining({key:'topic',value:'a',weight:3,evidenceCount:1}),
   expect.objectContaining({key:'format',value:'reel',weight:3,evidenceCount:1}),
   expect.objectContaining({key:'topic',value:'b',weight:-2,evidenceCount:1}),
   expect.objectContaining({key:'format',value:'carousel',weight:-2,evidenceCount:1}),
  ]));
  expect(memory.find(x=>x.key==='topic'&&x.value==='a')?.evidenceCount).toBe(1);
 });
});
