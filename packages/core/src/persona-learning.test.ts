import { describe, expect, it } from 'vitest';
import { compareContentOnDeclaredGoal, type PublishedContentMetrics } from './media-analytics';
import { learnPersonaPreference, personaPlanForDate, personaPreferencesFromApprovals, personaPreferencesFromContentResults, personaPreferencesFromStyleMemory, rankPersonaCandidates, rankPersonaTopics } from './persona-learning';

function metrics(candidateId:string,profileVisits:number|null,measuredAt='2026-10-04T13:00:00Z'):PublishedContentMetrics{return{candidateId,externalId:`post-${candidateId}`,channel:'instagram',measuredAt,impressions:1000,views:800,reach:900,watchTimeSeconds:4000,averageWatchSeconds:5,completionRate:0.5,likes:90,comments:18,saves:45,shares:27,profileVisits,follows:9,inquiries:3};}

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
 it('derives reusable correction preferences from canonical Style Memory without over-weighting one correction',()=>{
  const memory=personaPreferencesFromStyleMemory([
   {assetId:'a',dimension:'editing',value:'чистые склейки',signal:'specific_feedback',weight:0.82,createdAt:'2026-10-04T12:00:00Z'},
   {assetId:'b',dimension:'editing',value:'чистые склейки',signal:'specific_feedback',weight:0.82,createdAt:'2026-10-04T12:05:00Z'},
   {assetId:'c',dimension:'editing',value:'быстрые переходы',signal:'inferred',weight:0.2,createdAt:'2026-10-04T12:10:00Z'},
  ]);
  expect(memory).toEqual(expect.arrayContaining([
   {key:'style:editing',value:'чистые склейки',weight:1.64,evidenceCount:2,updatedAt:'2026-10-04T12:05:00Z'},
   {key:'style:editing',value:'быстрые переходы',weight:0.2,evidenceCount:1,updatedAt:'2026-10-04T12:10:00Z'},
  ]));
  expect(memory.find(x=>x.value==='чистые склейки')?.weight).toBeLessThan(3);
 });
 it('feeds declared-goal content results back into ranking with weaker evidence than explicit approval',()=>{
  const candidates=[{id:'a',title:'Репетиция',format:'reel',score:80},{id:'b',title:'Музыка',format:'carousel',score:81}];
  const better=compareContentOnDeclaredGoal({goal:'profile_visits',baseline:metrics('baseline-a',20),candidate:metrics('a',30,'2026-10-04T13:00:00Z')});
  const worse=compareContentOnDeclaredGoal({goal:'profile_visits',baseline:metrics('baseline-b',40),candidate:metrics('b',20,'2026-10-04T13:05:00Z')});
  const unknown=compareContentOnDeclaredGoal({goal:'profile_visits',baseline:metrics('baseline-c',0),candidate:metrics('a',10,'2026-10-04T13:10:00Z')});
  const memory=personaPreferencesFromContentResults(candidates,[
   {candidateId:'a',measuredAt:'2026-10-04T13:00:00Z',relativeChange:better.relativeChange},
   {candidateId:'b',measuredAt:'2026-10-04T13:05:00Z',relativeChange:worse.relativeChange},
   {candidateId:'a',measuredAt:'2026-10-04T13:10:00Z',relativeChange:unknown.relativeChange},
  ]);
  expect(memory).toEqual(expect.arrayContaining([
   {key:'topic',value:'a',weight:1,evidenceCount:1,updatedAt:'2026-10-04T13:00:00Z'},
   {key:'format',value:'reel',weight:1,evidenceCount:1,updatedAt:'2026-10-04T13:00:00Z'},
   {key:'topic',value:'b',weight:-1,evidenceCount:1,updatedAt:'2026-10-04T13:05:00Z'},
   {key:'format',value:'carousel',weight:-1,evidenceCount:1,updatedAt:'2026-10-04T13:05:00Z'},
  ]));
  expect(memory.find(x=>x.key==='topic'&&x.value==='a')?.weight).toBeLessThan(3);
  expect(rankPersonaCandidates(candidates,memory).map(x=>x.id)).toEqual(['a','b']);
 });
});
