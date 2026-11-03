import {env,json} from './_media-session.js';
import {readPersonaDirectorProposal} from '../packages/core/src/persona-director-model.js';

type Idea={id:string;title:string;angle:string;format:string};
const FREE_MODEL='nvidia/nemotron-3.5-lightning-free';
const events=new Map<string,{start:number;count:number}>();
const fail=(code:string):never=>{throw Error(code)};
function limit(request:Request):boolean{
 const ip=(request.headers.get('x-forwarded-for')??'local').split(',')[0].trim().slice(0,80);
 const now=Date.now(),current=events.get(ip);
 if(current&&now-current.start<3600000){
  if(current.count>=6)return false;
  current.count++;return true;
 }
 if(events.size>1000)events.clear();
 events.set(ip,{start:now,count:1});return true;
}
function isIdea(value:unknown):value is Idea{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const p=value as Partial<Idea>;
 return typeof p.id==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(p.id)&&
  typeof p.title==='string'&&p.title.trim().length>=4&&p.title.length<=140&&
  typeof p.angle==='string'&&p.angle.trim().length>=4&&p.angle.length<=1600&&
  ['reel','short','story'].includes(String(p.format));
}
function activeProvider():{provider:'ollama'|'gateway';model:string}|null{
 if(env('PERSONA_DIRECTOR_PROVIDER')==='ollama'&&
  (env('VERCEL_ENV')===''||env('VERCEL_ENV')==='development'))
  return {provider:'ollama',model:env('PERSONA_OLLAMA_MODEL')||'qwen3:4b-instruct'};
 if(env('PERSONA_DIRECTOR_PROVIDER')==='gateway'&&
  env('PERSONA_ENABLE_FREE_AI')==='true'&&env('VERCEL_ENV')==='preview')
  return {provider:'gateway',model:FREE_MODEL};
 return null;
}
const DIRECTOR_SYSTEM=[
 'Ты сценарист, режиссёр и монтажёр для автора-актёра и композитора.',
 'Создай оригинальный пригодный к самостоятельной СЪЁМКЕ короткий Reels на русском.',
 'НЕ повторяй предыдущие хуки или сюжет и НЕ выдумывай реальные биографические события.',
 'Допустимы постановочные роли и комические ситуации — не выдавай их за документальные факты.',
 'Конфликт или интрига в первые три секунды; причинное развитие, поворот и конкретный панчлайн.',
 'Каждая сцена: точная реплика, действие, камера, свет, актёрская задача, монтажный приём.',
 'Съёмка: один человек, телефон, штатив, одна комната, опционально клавиши, мягкий свет.',
 'Тон: харизма, небанальный юмор, киноязык, но без дешёвых клише.',
 'Не заявляй, что проанализировал реальные кадры или сделал монтаж: ты создаёшь план.',
 'Цвет: единая узнаваемая натуральная палитра, но параметры адаптируются к конкретному свету.',
 'Выход СТРОГО JSON без Markdown: ',
 '{"title":string,"hook":string,"scenes":[{"durationSec":int,"line":string,"action":string,',
 '"framing":"close-up"|"medium"|"detail","camera":string,"lighting":string,',
 '"performance":string,"edit":string}],"setup":{"location":string,"camera":string,',
 '"lighting":string,"sound":string,"wardrobe":string,"arrangement":string},',
 '"editingIntent":string,"colorIntent":string}',
 'Сцен 4–8, каждая 2–12 секунд, всего 15–70 секунд. В конце необходим авторский просмотр.',
].join('\n');
function extractJson(input:string):any{
 try{return JSON.parse(input.trim())}
 catch{fail('director_model_invalid_json')}
}
async function modelProposal(request:Request,provider:{provider:'ollama'|'gateway';model:string},input:unknown){
 const payload=JSON.stringify(input);
 if(payload.length>6000)fail('director_input_too_large');
 const prompt={role:'user',content:payload};
 let response:Response;
 if(provider.provider==='ollama'){
  try{
   response=await fetch('http://127.0.0.1:11434/api/chat',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({model:provider.model,stream:false,format:'json',
     messages:[{role:'system',content:DIRECTOR_SYSTEM},prompt],
     options:{temperature:0.8,num_predict:3200}}),
    signal:AbortSignal.timeout(90000),
   });
  }catch{fail('director_ollama_unavailable')}
 }else{
  const token=env('AI_GATEWAY_API_KEY')||request.headers.get('x-vercel-oidc-token')||env('VERCEL_OIDC_TOKEN');
  if(!token)fail('director_gateway_auth_missing');
  try{
   response=await fetch('https://ai-gateway.vercel.sh/v1/chat/completions',{
    method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({model:provider.model,
     messages:[{role:'system',content:DIRECTOR_SYSTEM},prompt],
     temperature:0.8,max_tokens:3200,response_format:{type:'json_object'}}),
    signal:AbortSignal.timeout(65000),
   });
  }catch{fail('director_gateway_unavailable')}
 }
 if(!response.ok)fail(provider.provider==='ollama'?'director_ollama_error':'director_gateway_error');
 let data:any;
 try{data=await response.json()}catch{fail('director_model_invalid_response')}
 const result=provider.provider==='ollama'?data?.message?.content:data?.choices?.[0]?.message?.content;
 if(typeof result!=='string'||!result.trim())fail('director_model_empty_result');
 return extractJson(result);
}
/** Explicit model invocation only. No templates, fake grading, background calls or publication. */
export default{
 async fetch(request:Request){
  const provider=activeProvider();
  if(request.method==='GET'){
   if(!provider)return json({status:'not_configured',realAI:false,renderedVideo:false});
   if(provider.provider==='gateway')return json({status:'configured',realAI:true,
    provider:provider.provider,model:provider.model,renderedVideo:false});
   try{
    const resp=await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(3500)});
    const tags:any=resp.ok?await resp.json():null;
    const installed=Boolean(tags?.models?.some((item:any)=>item.name===provider.model||
     item.model===provider.model));
    return json({status:installed?'ready':'model_not_installed',realAI:installed,
     provider:provider.provider,model:provider.model,renderedVideo:false});
   }catch{
    return json({status:'ollama_offline',realAI:false,
     provider:provider.provider,model:provider.model,renderedVideo:false});
   }
  }
  if(request.method!=='POST')return json({error:'method_not_allowed'},405,{Allow:'GET, POST'});
  if(!provider)return json({error:'director_model_not_configured'},503);
  if(!limit(request))return json({error:'director_limit_6_per_hour'},429);
  try{
   const raw=await request.text();
   if(raw.length>6500)fail('director_input_too_large');
   const body:any=JSON.parse(raw);
   if(!isIdea(body?.idea))fail('director_idea_invalid');
   const directions=['humor','cinematic','unexpected','intimate'];
   const variation=directions.includes(body?.variation)?body.variation:'unexpected';
   const prior=Array.isArray(body?.history)?body.history.slice(-12)
    .filter((item:unknown)=>typeof item==='string')
    .map((item:string)=>item.slice(0,150)):[];
   const unique=typeof body?.seed==='string'&&/^[a-zA-Z0-9_-]{6,80}$/.test(body.seed)
    ?body.seed:crypto.randomUUID();
   const data=await modelProposal(request,provider,{
    idea:body.idea,variation,previousHooksToAvoid:prior,creativeNonce:unique,
    practicalConstraints:'one person, one room, phone tripod; optional piano, microphone, one soft light',
   });
   const proposal={
    ...data,version:1,kind:'persona-director-proposal-v1',executionMode:'ai',
    ideaId:body.idea.id,provider:provider.provider,model:provider.model,
    publicationApproved:false,createdAt:new Date().toISOString(),
   };
   if(!readPersonaDirectorProposal(proposal,body.idea.id))
    fail('director_model_structure_invalid');
   const normalizedHooks=new Set(prior.map((s:string)=>s.trim().toLowerCase()));
   if(normalizedHooks.has(proposal.hook.trim().toLowerCase())||
    normalizedHooks.has(proposal.scenes[0].line.trim().toLowerCase()))
    fail('director_repeated_hook');
   return json(proposal);
  }catch(error){
   const code=String((error as Error)?.message||'director_unavailable');
   const allowed=/^director_[a-z0-9_]+$/i.test(code)?code:'director_unavailable';
   return json({error:allowed,realAI:false,renderedVideo:false},
    allowed==='director_limit_6_per_hour'?429:
    allowed==='director_idea_invalid'||allowed==='director_input_too_large'?400:503);
  }
 },
};
