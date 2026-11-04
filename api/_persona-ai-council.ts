import type { ScenarioIdea, ScenarioResearchItem } from "../packages/core/src/persona-scenario-intelligence.js";

export type AiCouncilTask = "research"|"ideation"|"review";
export type AiCouncilProvider = "perplexity_agent"|"ollama";
export type AiCouncilModel = {id:string;provider:AiCouncilProvider;model:string;
  /** Explicit operator-declared suitability (0–3), not a benchmark result. */
  skills:Record<AiCouncilTask,number>;costTier:1|2|3};
export type AiCouncilOutcome = {modelId:string;task:AiCouncilTask;accepted:boolean;revisionId?:string};
export type AiCouncilStep = {task:AiCouncilTask;modelId:string;provider:AiCouncilProvider;model:string;
  selectionBasis:string;status:"completed"|"failed";costUsd:number|null;
  inputTokens:number|null;outputTokens:number|null};
export type AiCouncilResult = {version:1;status:"proposed_unapproved";
  researchStatus:"source_metadata_only"|"no_verified_sources";
  researchSummary:string;sources:ScenarioResearchItem[];ideas:ScenarioIdea[];
  review:{recommendationIndex:number|null;rationale:string;concerns:string[];independentModel:boolean};
  steps:AiCouncilStep[];totalReportedCostUsd:number;costReportingComplete:boolean;
  publicationApproved:false;distributionAllowed:false};
const tasks:AiCouncilTask[]=["research","ideation","review"];
const safeId=/^[a-zA-Z0-9_-]{2,55}$/;
const safeModel=/^[a-zA-Z0-9_.:/-]{2,120}$/;
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==="object"&&!Array.isArray(value)}
function brief(value:unknown,max=450):string{return typeof value==="string"&&value.trim().length>0&&value.trim().length<=max?value.trim():""}
function url(value:unknown):string|null{
  if(typeof value!=="string"||value.length>900)return null;
  try{const u=new URL(value);if(!["https:","http:"].includes(u.protocol)||u.username||u.password)return null;u.hash="";return u.href}
  catch{return null}
}
export function parseCouncilModels(json:string):AiCouncilModel[]{
  if(!json.trim())return [];
  const input=JSON.parse(json) as unknown;
  if(!Array.isArray(input)||input.length>12)throw Error("Persona AI registry accepts at most 12 models");
  const ids=new Set<string>();
  return input.map((item,index)=>{
    if(!record(item)||!safeId.test(String(item.id))||ids.has(String(item.id))||
      !["perplexity_agent","ollama"].includes(String(item.provider))||
      !safeModel.test(String(item.model))||!record(item.skills)||
      ![1,2,3].includes(Number(item.costTier)))throw Error("Invalid model configuration at "+index);
    const skills=Object.fromEntries(tasks.map(task=>[task,item.skills[task]])) as Record<AiCouncilTask,unknown>;
    if(tasks.some(task=>!Number.isInteger(skills[task])||(skills[task] as number)<0||(skills[task] as number)>3))
      throw Error("Model task suitability must be integer 0–3");
    if(item.provider==="ollama"&&(skills.research as number)>0)
      throw Error("Local Ollama has no verified web search and cannot do live research");
    ids.add(item.id as string);
    return {id:item.id as string,provider:item.provider as AiCouncilProvider,model:item.model as string,
      skills:skills as Record<AiCouncilTask,number>,costTier:item.costTier as 1|2|3};
  });
}
/** Author feedback can improve future routing, but is never presented as objective performance data. */
export function chooseCouncilModel(
  models:readonly AiCouncilModel[],task:AiCouncilTask,available:(model:AiCouncilModel)=>boolean,
  outcomes:readonly AiCouncilOutcome[]=[],avoidModelId?:string,
):{model:AiCouncilModel;basis:string}|null{
  const usable=models.filter(m=>m.skills[task]>0&&available(m));
  if(!usable.length)return null;
  const ranked=usable.map(model=>{
    const feedback=outcomes.filter(o=>o.modelId===model.id&&o.task===task);
    const observed=feedback.length>=3;
    const rate=observed?feedback.filter(o=>o.accepted).length/feedback.length:0;
    const diverse=avoidModelId&&model.id!==avoidModelId?1:0;
    const score=model.skills[task]*10+diverse*5+(observed?rate*8:0)-model.costTier*.75;
    return {model,score,observed,count:feedback.length};
  }).sort((a,b)=>b.score-a.score||a.model.id.localeCompare(b.model.id));
  const first=ranked[0];
  return {model:first.model,basis:first.observed
    ?"Заявленная пригодность, отзывы автора ("+first.count+"), разнообразие моделей и класс затрат."
    :"Пригодность для задачи, доступность и класс затрат; независимых измерений качества ещё нет."};
}
export function extractCouncilText(response:unknown):string{
  if(!record(response)||response.status!=="completed")throw Error("AI provider did not complete a response");
  if(typeof response.output_text==="string"&&response.output_text.trim())return response.output_text;
  const output=Array.isArray(response.output)?response.output:[];
  const contents=output.flatMap(item=>record(item)&&Array.isArray(item.content)?item.content:[]);
  const text=contents.filter(record).filter(c=>c.type==="output_text"&&typeof c.text==="string")
    .map(c=>c.text as string).join("\n");
  if(!text.trim())throw Error("AI provider returned no text");
  return text;
}
export function parseCouncilJson(text:string):Record<string,unknown>{
  const trimmed=text.trim().replace(/^\u0060{3}(?:json)?\s*/i,"").replace(/\s*\u0060{3}$/,"");
  const parsed=JSON.parse(trimmed) as unknown;
  if(!record(parsed))throw Error("AI response must be JSON object");
  return parsed;
}
/** Import ONLY actual search-tool results, never links hallucinated in model prose. */
export function extractCouncilSources(response:unknown,now:string):ScenarioResearchItem[]{
  if(!record(response)||!Array.isArray(response.output))return [];
  const observed=new Set<string>(),list:ScenarioResearchItem[]=[];
  for(const item of response.output){
    if(!record(item)||item.type!=="search_results"||!Array.isArray(item.results))continue;
    for(const result of item.results){
      if(!record(result))continue;
      const link=url(result.url);if(!link||observed.has(link)||list.length>=10)continue;
      const title=brief(result.title,220);if(!title)continue;
      observed.add(link);
      const host=new URL(link).hostname.toLowerCase();
      const platform=host.endsWith("instagram.com")?"instagram":host.endsWith("youtube.com")||host==="youtu.be"?"youtube":"other";
      const rawDate=typeof result.date==="string"?result.date:"";
      const publishedAt=/^\d{4}-\d{2}-\d{2}$/.test(rawDate)&&!Number.isNaN(Date.parse(rawDate))?rawDate:undefined;
      list.push({id:"ai-research-"+String(list.length+1),url:link,
        platform,observedAt:now,observationStatus:"metadata_only",
        title,...(publishedAt?{publishedAt}:{}),
        evidence:{kind:"allowed_search_result",observedFields:["url","title",...(publishedAt?["date" as const]:[])]}});
    }
  }
  return list;
}
export function parseCouncilIdeas(
  value:unknown,sources:readonly ScenarioResearchItem[],
  trace:{id:string;provider:AiCouncilProvider;model:string},runId:string,
):ScenarioIdea[]{
  if(!record(value)||!Array.isArray(value.ideas)||value.ideas.length!==3)
    throw Error("AI must return exactly three original ideas");
  const titles=new Set<string>();
  return value.ideas.map((raw,index)=>{
    if(!record(raw))throw Error("Idea must be an object");
    const title=brief(raw.title,130),conflict=brief(raw.conflict,650),
      actingTask=brief(raw.actingTask,450),ending=brief(raw.ending,450),
      productionRisk=brief(raw.productionRisk,400),creativeProfileFit=brief(raw.profileFit,400),
      evidenceNote=brief(raw.reason,700);
    if([title,conflict,actingTask,ending,productionRisk,creativeProfileFit,evidenceNote].some(x=>x.length<8)||
       titles.has(title.toLocaleLowerCase("ru-RU"))||
       !["low","medium","high"].includes(String(raw.complexity))||
       !Number.isInteger(raw.durationSec)||Number(raw.durationSec)<12||Number(raw.durationSec)>90)
      throw Error("AI returned vague or duplicate unshootable ideas");
    titles.add(title.toLocaleLowerCase("ru-RU"));
    const indices=Array.isArray(raw.sourceIndices)?raw.sourceIndices.filter(x=>Number.isInteger(x)&&x>=0&&x<sources.length):[];
    const referenceIds=[...new Set(indices.map(i=>sources[i as number].id))];
    return {id:"ai-"+runId+"-"+String(index+1),title,referenceIds,originalConflict:conflict,
      actingTask,ending,productionComplexity:raw.complexity as "low"|"medium"|"high",
      productionRisk,estimatedDurationSec:raw.durationSec as number,creativeProfileFit,
      origin:"ai_generated" as const,
      evidenceNote:evidenceNote+" Реальные Instagram-метрики не подтверждены.",
      aiProvenance:{provider:trace.provider,model:trace.model,modelId:trace.id,runId,status:"unapproved" as const}};
  });
}
