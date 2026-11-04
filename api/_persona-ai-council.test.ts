import {afterEach,describe,expect,it,vi} from 'vitest';
import handler from './persona-ai-council.js';
import {parseCouncilModels,chooseCouncilModel,extractCouncilSources,parseCouncilIdeas} from './_persona-ai-council.js';

const registry=[
 {id:'research-p',provider:'perplexity_agent',model:'openai/gpt-5.6-sol',
  skills:{research:3,ideation:1,review:1},costTier:2},
 {id:'creative-p',provider:'perplexity_agent',model:'anthropic/claude-sonnet-4.5',
  skills:{research:0,ideation:3,review:1},costTier:2},
 {id:'critic-p',provider:'perplexity_agent',model:'openai/gpt-5.6-sol',
  skills:{research:0,ideation:1,review:3},costTier:2},
] as const;
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()});
const ideas=()=>({ideas:[0,1,2].map(i=>({
 title:'Неожиданная сценическая задача '+i,conflict:'Режиссёр даёт герою новую задачу прямо перед пробой '+i,
 actingTask:'Удержать образ, несмотря на неожиданные обстоятельства '+i,
 ending:'Музыкальная пауза раскрывает настоящий смысл ситуации '+i,
 complexity:'low',productionRisk:'Без реакции актёра шутка не работает '+i,
 profileFit:'Можно сыграть разные состояния в одной комнате '+i,
 durationSec:24+i,reason:'Понятный конфликт и возможность выразительного контраста '+i,
 sourceIndices:[0],
})]}));
const reply=(model:string,content:unknown,research=false)=>({
 status:'completed',model,output:[
  ...(research?[{type:'search_results',results:[
   {title:'Актёрские скетчи',url:'https://example.org/acting-reels',date:'2026-10-23'},
   {title:'Повтор того же источника',url:'https://example.org/acting-reels'},
  ]}]:[]),
  {type:'message',content:[{type:'output_text',text:JSON.stringify(content)}]}
 ],usage:{cost:{total_cost:0.001},input_tokens:35,output_tokens:90},
});
const url='http://localhost/api/persona-ai-council';

describe('Persona AI routing logic',()=>{
 it('rejects misleading registry specs and does not invent capabilities',()=>{
  expect(()=>parseCouncilModels(JSON.stringify([{...registry[0],provider:'ollama'}]))).toThrow(/no verified web search/);
  expect(()=>parseCouncilModels(JSON.stringify([registry[0],registry[0]]))).toThrow();
  expect(parseCouncilModels(JSON.stringify(registry))).toHaveLength(3);
 });
 it('routes by task and updates with real labeled author feedback rather than fake benchmarks',()=>{
  const models=parseCouncilModels(JSON.stringify(registry));
  expect(chooseCouncilModel(models,'research',()=>true)?.model.id).toBe('research-p');
  expect(chooseCouncilModel(models,'ideation',()=>true)?.model.id).toBe('creative-p');
  expect(chooseCouncilModel(models,'review',()=>true,[],'creative-p')?.model.id).toBe('critic-p');
  const reports=Array.from({length:4},()=>({modelId:'critic-p',task:'review' as const,accepted:true}));
  expect(chooseCouncilModel(models,'review',()=>true,reports,'creative-p')?.basis).toMatch(/отзывы автора/i);
  expect(chooseCouncilModel(models,'ideation',m=>m.id==='research-p')?.model.id).toBe('research-p');
 });
 it('only imports actual web search-tool evidence, never model-invented sources',()=>{
  const modelText={status:'completed',output:[{type:'message',content:[{
   type:'output_text',text:'{"source":"https://fake.example/supposedly_viral"}'}]}]};
  expect(extractCouncilSources(modelText,'2026-11-04T10:00:00.000Z')).toEqual([]);
  const actual=extractCouncilSources(reply('test',{summary:'Необязательная информация'},true),'2026-11-04T10:00:00.000Z');
  expect(actual).toHaveLength(1);
  expect(actual[0].observationStatus).toBe('metadata_only');
  expect(actual[0].metrics).toBeUndefined();
  expect(actual[0].evidence.kind).toBe('allowed_search_result');
 });
 it('rejects duplicate or fake AI idea lists',()=>{
  const source=extractCouncilSources(reply('test',{summary:'OK'},true),'2026-11-04T10:00:00.000Z');
  expect(()=>parseCouncilIdeas({ideas:[ideas().ideas[0]]},source,
   {id:'creative-p',provider:'perplexity_agent',model:'model'},'abc')).toThrow(/exactly three/);
  const original=ideas().ideas;
  expect(()=>parseCouncilIdeas({ideas:[original[0],{...original[1],title:original[0].title},original[2]]},
   source,{id:'creative-p',provider:'perplexity_agent',model:'model'},'abc')).toThrow(/duplicate/);
 });
});
describe('Persona Council API paid-call and identity guarantees',()=>{
 it('does not contact any model while disabled',async()=>{
  const network=vi.fn();vi.stubGlobal('fetch',network);
  const response=await handler.fetch(new Request(url,{method:'POST',headers:{Origin:'http://localhost'},
   body:JSON.stringify({action:'run',confirmedSpend:true,creativeProfile:{priorities:[],constraints:[]}})}));
  expect(response.status).toBe(403);
  expect(network).not.toHaveBeenCalled();
 });
 it('executes Perplexity Agent research, distinct ideator and editor only after opt-in',async()=>{
  vi.stubEnv('PERSONA_AI_COUNCIL_ENABLED','true');
  vi.stubEnv('PERSONA_AI_COUNCIL_MODELS_JSON',JSON.stringify(registry));
  vi.stubEnv('PERPLEXITY_API_KEY','test-only-token-do-not-use');
  vi.stubEnv('PERSONA_AI_COUNCIL_MAX_USD','0.2');
  const network=vi.fn(async (_uri:string,options:RequestInit)=>{
   const request=JSON.parse(String(options.body));
   const input=JSON.parse(request.input);
   return Response.json(input.goal?reply(request.model,{summary:'Изучены открытые публикации о коротких актёрских скетчах',mechanics:['контраст','реакция']},true)
    :String(input.task).startsWith('Сформируй')?reply(request.model,ideas())
    :reply(request.model,{recommendationIndex:1,rationale:'У второй идеи самый ясный конфликт',
      concerns:['Нужно проверить естественность реплик']}));
  });
  vi.stubGlobal('fetch',network);
  const status=await handler.fetch(new Request(url));
  expect((await status.json()).state).toBe('configured_not_live_verified');
  const request=new Request(url,{method:'POST',
   headers:{Origin:'http://localhost','Content-Type':'application/json'},
   body:JSON.stringify({action:'run',confirmedSpend:true,
    creativeProfile:{priorities:['актёрская игра','музыка'],constraints:['одна комната']}})});
  const response=await handler.fetch(request);
  expect(response.status).toBe(200);
  const result=await response.json();
  expect(result.publicationApproved).toBe(false);
  expect(result.distributionAllowed).toBe(false);
  expect(result.ideas).toHaveLength(3);
  expect(result.ideas[1].origin).toBe('ai_generated');
  expect(result.ideas[1].referenceIds).toHaveLength(1);
  expect(result.ideas[1].aiProvenance.model).toBe('anthropic/claude-sonnet-4.5');
  expect(result.sources.every((s:{observationStatus:string})=>s.observationStatus==='metadata_only')).toBe(true);
  expect(result.review.recommendationIndex).toBe(1);
  expect(result.review.independentModel).toBe(true);
  expect(result.steps.map((x:{modelId:string})=>x.modelId)).toEqual(['research-p','creative-p','critic-p']);
  expect(result.totalReportedCostUsd).toBeCloseTo(0.003);
  expect(network).toHaveBeenCalledTimes(3);
  expect(JSON.stringify(result)).not.toContain('test-only-token-do-not-use');
 });
 it('refuses cross-origin calls before any paid request',async()=>{
  vi.stubEnv('PERSONA_AI_COUNCIL_ENABLED','true');
  const network=vi.fn();vi.stubGlobal('fetch',network);
  const response=await handler.fetch(new Request(url,{method:'POST',
   headers:{Origin:'https://attacker.example'},
   body:JSON.stringify({action:'run',confirmedSpend:true,creativeProfile:{priorities:[],constraints:[]}})}));
  expect(response.status).toBe(403);
  expect(network).not.toHaveBeenCalled();
 });
});
