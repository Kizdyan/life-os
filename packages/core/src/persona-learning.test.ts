import { describe, expect, it } from 'vitest';
import { learnPersonaPreference, personaPlanForDate, rankPersonaCandidates, rankPersonaTopics } from './persona-learning';

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
});
