import {env,json} from "./_media-session.js";
import {parseCouncilModels,chooseCouncilModel,extractCouncilText,parseCouncilJson,
  extractCouncilSources,parseCouncilIdeas,type AiCouncilTask,type AiCouncilModel,
  type AiCouncilOutcome,type AiCouncilStep,type AiCouncilResult} from "./_persona-ai-council.js";

const recent=new Map<string,{since:number,count:number}>();
const HOUR=3600_000;
function models(){return parseCouncilModels(env("PERSONA_AI_COUNCIL_MODELS_JSON"))}
function eligible(model:AiCouncilModel):boolean{
  if(model.provider==="perplexity_agent")return Boolean(env("PERPLEXITY_API_KEY"));
  return !env("VERCEL_ENV")&&env("PERSONA_AI_COUNCIL_ALLOW_OLLAMA")==="true";
}
function gate(request:Request):string|null{
  if(env("PERSONA_AI_COUNCIL_ENABLED")!=="true")return "council_disabled";
  const host=new URL(request.url).hostname;
  const local=!env("VERCEL_ENV")&&["localhost","127.0.0.1"].includes(host);
  const token=env("PERSONA_AI_COUNCIL_ACCESS_TOKEN");
  if(!local&&token.length<24)return "council_access_token_missing";
  if(token&&request.headers.get("x-persona-ai-access")!==token)return "council_access_denied";
  if(!local&&env("VERCEL_ENV")==="production")return "council_production_locked";
  return null;
}
function requestAllowed(request:Request):boolean{
  const id=(request.headers.get("x-forwarded-for")??"local").split(",")[0].trim().slice(0,70);
  const now=Date.now(),prev=recent.get(id);
  if(prev&&now-prev.since<HOUR){if(prev.count>=2)return false;prev.count++;return true}
  if(recent.size>300)recent.clear();
  recent.set(id,{since:now,count:1});return true;
}
function config(){
  let found:AiCouncilModel[]=[];
  try{found=models()}catch{return {state:"invalid_configuration",models:[],note:"Неверный список моделей на сервере"}}
  const enabled=env("PERSONA_AI_COUNCIL_ENABLED")==="true";
  return {
    state:!enabled?"disabled":!found.length?"models_missing":
      !found.some(model=>model.skills.research>0&&eligible(model))?"research_unavailable":"configured_not_live_verified",
    models:found.map(model=>({id:model.id,provider:model.provider,model:model.model,
      skills:model.skills,costTier:model.costTier,configured:eligible(model)})),
    requiresExplicitBudgetApproval:true,usesPaidApi:found.some(m=>m.provider==="perplexity_agent"),
    note:"Конфигурация не означает успешный вызов. Платные запросы только после явного запуска.",
  };
}
function parseInput(body:unknown){
  if(!body||typeof body!=="object"||Array.isArray(body))throw Error("invalid_body");
  const input=body as Record<string,unknown>;
  if(input.action!=="run"||input.confirmedSpend!==true)throw Error("explicit_spend_approval_required");
  if(!input.creativeProfile||typeof input.creativeProfile!=="object"||Array.isArray(input.creativeProfile))
    throw Error("creative_profile_required");
  const profile=input.creativeProfile as Record<string,unknown>;
  const take=(v:unknown,max:number)=>Array.isArray(v)?v.filter(x=>typeof x==="string")
    .slice(0,max).map(x=>(x as string).slice(0,180)):[];
  const history=take(input.history,12),feedback=take(input.feedback,8);
  const priorities=take(profile.priorities,10),constraints=take(profile.constraints,12);
  const observations:AiCouncilOutcome[]=Array.isArray(input.outcomes)
    ?input.outcomes.slice(-35).filter((v):v is AiCouncilOutcome=>!!v&&typeof v==="object"&&
      ["research","ideation","review"].includes((v as AiCouncilOutcome).task)&&
      typeof (v as AiCouncilOutcome).modelId==="string"&&
      typeof (v as AiCouncilOutcome).accepted==="boolean"):[];
  return {history,feedback,priorities,constraints,observations};
}
function cost(reply:Record<string,unknown>):number|null{
  const usage=reply.usage;
  if(!usage||typeof usage!=="object")return null;
  const result=usage as Record<string,unknown>;
  const breakdown=result.cost;
  if(!breakdown||typeof breakdown!=="object")return null;
  const amount=(breakdown as Record<string,unknown>).total_cost;
  return typeof amount==="number"&&Number.isFinite(amount)&&amount>=0?amount:null;
}
function tokens(reply:Record<string,unknown>,name:string):number|null{
  const u=reply.usage;if(!u||typeof u!=="object")return null;
  const n=(u as Record<string,unknown>)[name];return typeof n==="number"&&Number.isFinite(n)?n:null;
}
async function invoke(model:AiCouncilModel,task:AiCouncilTask,input:string):Promise<Record<string,unknown>>{
  if(model.provider==="ollama"){
    if(env("VERCEL_ENV")||env("PERSONA_AI_COUNCIL_ALLOW_OLLAMA")!=="true")
      throw Error("ollama_unavailable_outside_local_development");
    const response=await fetch("http://127.0.0.1:11434/api/chat",{
      method:"POST",headers:{"Content-Type":"application/json"},signal:AbortSignal.timeout(45000),
      body:JSON.stringify({model:model.model,stream:false,format:"json",
        messages:[{role:"system",content:"Ты профессиональный редактор Persona. Верни только валидный JSON. Не выдумывай подтверждённые источники."},
          {role:"user",content:input}]}),
    });
    if(!response.ok)throw Error("ollama_http_"+response.status);
    const data=await response.json() as Record<string,unknown>;
    const message=data.message as Record<string,unknown>|undefined;
    return {status:"completed",model:model.model,
      output_text:typeof message?.content==="string"?message.content:"",
      usage:{input_tokens:data.prompt_eval_count??null,output_tokens:data.eval_count??null}};
  }
  const key=env("PERPLEXITY_API_KEY");if(!key)throw Error("perplexity_api_key_missing");
  const instructions=task==="research"
    ?"Ты исследователь форматов Instagram Reels. Применяй web_search к публичным источникам. Не выдумывай просмотры, удержание или факт просмотра конкретного видео. Кратко верни JSON с полями summary и mechanics (массив текстовых приёмов)."
    :task==="ideation"
    ?"Ты сценарист, продюсер и режиссёр. Предложи ровно три ОРИГИНАЛЬНЫЕ снимаемые идеи, разные по драматургии. Верни только JSON по схеме в запросе. Не копируй референсы и не выдавай непроверенные метрики за факты."
    :"Ты независимый критик идеи. Проверь конфликт, хук, естественность, актёрскую задачу и снимаемость. Верни строго JSON; не утверждай автора и не подменяй его выбор.";
  const response=await fetch("https://api.perplexity.ai/v1/agent",{
    method:"POST",signal:AbortSignal.timeout(task==="research"?60000:45000),
    headers:{"Content-Type":"application/json",Authorization:"Bearer "+key},
    body:JSON.stringify({model:model.model,input,instructions,stream:false,store:false,
      max_output_tokens:task==="research"?1400:task==="ideation"?2000:800,
      ...(task==="research"?{tools:[{type:"web_search"}],max_tool_calls:2}:{tools:[]})}),
  });
  if(!response.ok)throw Error("perplexity_agent_http_"+response.status);
  return await response.json() as Record<string,unknown>;
}
export async function runPersonaAiCouncil(input:ReturnType<typeof parseInput>,now=new Date().toISOString()):Promise<AiCouncilResult>{
  const catalogue=models();
  const stepOrder:AiCouncilTask[]=["research","ideation","review"];
  const steps:AiCouncilStep[]=[];
  let spent=0,reported=true;
  const limit=Number(env("PERSONA_AI_COUNCIL_MAX_USD"));
  if(!Number.isFinite(limit)||limit<=0||limit>3)throw Error("council_spend_limit_missing_or_invalid");
  const runId=Date.now().toString(36);
  const use=async(task:AiCouncilTask,data:string,avoidId?:string)=>{
    const pick=chooseCouncilModel(catalogue,task,eligible,input.observations,avoidId);
    if(!pick)throw Error("council_model_unavailable_"+task);
    const reply=await invoke(pick.model,task,data);
    const text=extractCouncilText(reply);
    const actualCost=cost(reply);
    if(actualCost!==null)spent+=actualCost;else if(pick.model.provider==="perplexity_agent")reported=false;
    steps.push({task,modelId:pick.model.id,provider:pick.model.provider,
      model:typeof reply.model==="string"?reply.model:pick.model.model,
      selectionBasis:pick.basis,status:"completed",costUsd:actualCost,
      inputTokens:tokens(reply,"input_tokens"),outputTokens:tokens(reply,"output_tokens")});
    // This protects subsequent calls. Providers may still bill for the preceding call.
    if(spent>limit)throw Error("council_post_request_spend_limit_reached");
    if(!reported)throw Error("council_cost_unreported_stop_before_next_call");
    return {reply,text,model:pick.model};
  };
  if(stepOrder.length>3)throw Error("council_step_limit");
  const research=await use("research",JSON.stringify({
    goal:"Найди актуальные публичные исследования коротких актёрских/музыкальных видео и приёмы Instagram Reels.",
    priorities:input.priorities,constraints:input.constraints,
    output:"JSON {summary:string, mechanics:string[]}. Пиши на русском; без выдуманных показателей.",
  }));
  const sources=extractCouncilSources(research.reply,now).map((s,i)=>({...s,id:"ai-research-"+runId+"-"+(i+1)}));
  const researchText=parseCouncilJson(research.text);
  const summary=typeof researchText.summary==="string"?researchText.summary.slice(0,1100):"Нет подтверждённого содержательного отчёта.";
  const ideasCall=await use("ideation",JSON.stringify({
    task:"Сформируй три оригинальные идеи Reels для актёра и музыканта с конкретным конфликтом, действием и панчлайном.",
    researchSummary:summary,
    sourceReferences:sources.map((s,i)=>({index:i,url:s.url,title:s.title,date:s.publishedAt??null,status:"metadata_only"})),
    creativeProfile:{priorities:input.priorities,constraints:input.constraints},
    previouslyUsed:input.history,rejectedFeedback:input.feedback,
    outputSchema:{ideas:[{title:"строка",conflict:"конкретный конфликт",actingTask:"что играет актёр",
      ending:"поворот и панчлайн",complexity:"low|medium|high",productionRisk:"что может не получиться",
      profileFit:"почему подходит автору",durationSec:30,reason:"продюсерская аргументация",
      sourceIndices:[0]}]},
    rule:"Ровно три разных идеи. Не утверждай просмотр референса без просмотра.",
  }),research.model.id);
  const ideas=parseCouncilIdeas(parseCouncilJson(ideasCall.text),sources,
    {id:ideasCall.model.id,provider:ideasCall.model.provider,model:steps[1].model},runId);
  let review:AiCouncilResult["review"]={recommendationIndex:null,
    rationale:"Независимая оценка ещё не завершена.",concerns:[],independentModel:false};
  const reviewCall=await use("review",JSON.stringify({
    task:"Оцени каждую из трёх идей. Не изменяй реплики и не объявляй сценарий утверждённым.",
    researchLimitations:sources.length?"Только метаданные публичных ссылок.":"Подтверждённых источников нет.",
    ideas:ideas.map(i=>({title:i.title,conflict:i.originalConflict,ending:i.ending,
      shootRisk:i.productionRisk,profileFit:i.creativeProfileFit})),
    outputSchema:{recommendationIndex:0,rationale:"почему именно этот вариант",concerns:["что ещё проверить"]},
  }),ideasCall.model.id);
  const critique=parseCouncilJson(reviewCall.text);
  const independent=reviewCall.model.id!==ideasCall.model.id&&steps[2].model!==steps[1].model;
  const index=critique.recommendationIndex;
  review={
    recommendationIndex:Number.isInteger(index)&&index>=0&&index<3?index as number:null,
    rationale:typeof critique.rationale==="string"?critique.rationale.slice(0,900):"Критик не объяснил выбор.",
    concerns:Array.isArray(critique.concerns)?critique.concerns.filter(x=>typeof x==="string").slice(0,5).map(x=>(x as string).slice(0,250)):[],
    independentModel:independent,
  };
  return {version:1,status:"proposed_unapproved",
    researchStatus:sources.length?"source_metadata_only":"no_verified_sources",
    researchSummary:summary,sources,ideas,review,steps,
    totalReportedCostUsd:Number(spent.toFixed(6)),costReportingComplete:reported,
    publicationApproved:false,distributionAllowed:false};
}
export default {
  async fetch(request:Request):Promise<Response>{
    if(request.method==="GET")return json(config());
    if(request.method!=="POST")return json({error:"method_not_allowed"},405,{Allow:"GET, POST"});
    const origin=request.headers.get("origin");
    if(origin&&origin!==new URL(request.url).origin)return json({error:"cross_origin_blocked"},403);
    const blocked=gate(request);if(blocked)return json({error:blocked},403);
    if(!requestAllowed(request))return json({error:"council_hourly_limit"},429);
    try{
      const raw=await request.text();
      if(raw.length>5500)return json({error:"council_input_too_large"},413);
      const input=parseInput(JSON.parse(raw));
      const result=await runPersonaAiCouncil(input);
      return json(result);
    }catch(error){
      const reason=error instanceof Error?error.message:"council_failed";
      const publicReason=/^(council_|invalid_body|creative_profile_required|explicit_spend_approval_required|AI |Model |Local |Persona )/.test(reason)
        ?reason:"council_provider_or_schema_error";
      return json({error:publicReason},400);
    }
  }
};
