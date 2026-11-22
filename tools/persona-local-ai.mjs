#!/usr/bin/env node
/** Real LOCAL Ollama completion benchmark for Persona; no remote fallback.
 * Usage: node tools/persona-local-ai.mjs --probe
 *        node tools/persona-local-ai.mjs --run --model=qwen2.5-coder:7b --out=script.json
 * Personal brief: optional --brief-file=brief.txt; user must explicitly opt in.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const DEFAULT='http://127.0.0.1:11434';
const MAX=262144;
const DEMO='Комедийный Reels о молодом актёре перед выходом на сцену; снять одному на iPhone за 30–45 секунд. Нужны ракурсы, звук, свет, монтаж и неожиданный финал.';
const SYSTEM='Ты опытный режиссёр и сценарист вертикального кино. Отвечай только JSON-объектом, без Markdown: {"title":"...","hook":"...","twist":"...","runtimeSec":35,"scenes":[{"startSec":0,"endSec":6,"action":"действие актёра","dialogue":"реплика или без слов","camera":"ракурс и движение iPhone","lighting":"источник и направление света","sound":"звук","edit":"точка и тип склейки"}],"shootingOrder":"...","productionNotes":"...","caption":"...","platforms":{"instagram":"...","vk":"...","youtube":"..."}}. Сделай 4–10 сцен без разрывов, от секунды 0 до runtimeSec, длительность 30–45 с, реально снять одному на iPhone. Конкретные действия и реплики; естественный юмор, неожиданный финал, без выдуманных биографических фактов. Не утверждай, будто видео уже смонтировано.';

export function localOrigin(endpoint=DEFAULT){
 let url;try{url=new URL(endpoint)}catch{throw Error('Invalid Ollama endpoint')}
 if(url.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||
    url.username||url.password||url.search||url.hash||(url.pathname!=='/'&&url.pathname!==''))
    throw Error('Only HTTP loopback Ollama origin is allowed');
 return url.origin;
}
export function safeModel(value){
 if(typeof value!=='string'||!/^[a-zA-Z0-9_.:/-]{1,120}$/.test(value))throw Error('Invalid model ID');
 if(/(?:^|[:/])cloud(?:$|[:/])/i.test(value))throw Error('Ollama cloud model not allowed in local-only pilot');
 return value;
}
async function jsonRequest(url,opts,transport,timeoutMs){
 let res;
 try{res=await transport(url,{...opts,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(timeoutMs)})}
 catch{throw Error('Local Ollama unavailable')}
 if(!res.ok)throw Error('Local Ollama HTTP '+res.status);
 if(Number(res.headers.get('content-length')||0)>MAX)throw Error('Response too large');
 const raw=await res.text();
 if(raw.length>MAX)throw Error('Response too large');
 try{return JSON.parse(raw)}catch{throw Error('Invalid JSON from local model')}
}
export async function listModels(endpoint=DEFAULT,transport=fetch){
 const result=await jsonRequest(localOrigin(endpoint)+'/api/tags',{method:'GET'},transport,8000);
 if(!Array.isArray(result?.models))throw Error('Invalid local model list');
 return result.models.flatMap(x=>typeof x?.name==='string'?[x.name]:[]);
}
/** Structural QA only: NOT a subjective creative or real video quality score. */
export function inspectScript(draft){
 const issues=[];
 if(!draft||typeof draft!=='object'||Array.isArray(draft))return{pass:false,score:0,issues:['Script is not a JSON object']};
 const scenes=draft.scenes;
 if(!Array.isArray(scenes)||scenes.length<4||scenes.length>10)return{pass:false,score:0,issues:['Need 4–10 scenes']};
 let score=0;
 for(const field of ['title','hook','twist']){
  if(typeof draft[field]==='string'&&draft[field].trim().length>=8)score+=10;
  else issues.push('Missing '+field);
 }
 const duration=draft.runtimeSec;
 if(Number.isInteger(duration)&&duration>=30&&duration<=45)score+=10;
 else issues.push('Runtime must be 30–45 seconds');
 let cursor=0,validTiming=true,fields=0;
 const unique=new Set();
 for(let i=0;i<scenes.length;i++){
  const s=scenes[i];
  if(!s||typeof s!=='object'){issues.push('Missing scene '+(i+1));validTiming=false;continue}
  if(s.startSec!==cursor||!Number.isFinite(s.endSec)||s.endSec<=s.startSec||s.endSec>45){
   validTiming=false;issues.push('Broken timing scene '+(i+1));
  }
  cursor=s.endSec;
  for(const k of ['action','dialogue','camera','lighting','sound','edit']){
   if(typeof s[k]==='string'&&s[k].trim().length>=8)fields++;
   else issues.push('Scene '+(i+1)+' missing '+k);
  }
  if(typeof s.action==='string')unique.add(s.action.trim().toLowerCase());
 }
 if(validTiming&&cursor===duration)score+=20;
 else issues.push('Scene timings do not match total duration');
 score+=Math.round(fields/(scenes.length*6)*20);
 if(unique.size>=Math.ceil(scenes.length*0.75))score+=10;
 else issues.push('Repeated or vague scene actions');
 for(const key of ['shootingOrder','productionNotes']){
  if(typeof draft[key]==='string'&&draft[key].trim().length>=20)score+=5;
  else issues.push('Missing '+key);
 }
 const p=draft.platforms;
 if(p&&['instagram','vk','youtube'].every(x=>typeof p[x]==='string'&&p[x].trim().length>=8))score+=10;
 else issues.push('Platform adaptations missing');
 return{pass:issues.length===0&&score>=90,score:Math.min(score,100),issues,
  note:'Structural QA only; originality, story quality and filmed media are NOT verified.'};
}
export async function runLocal({endpoint=DEFAULT,model,brief=DEMO,transport=fetch}={}){
 const origin=localOrigin(endpoint),id=safeModel(model);
 if(typeof brief!=='string'||brief.trim().length<1||brief.length>3500)
  throw Error('Brief must be 1–3500 characters');
 const installed=await listModels(endpoint,transport);
 if(!installed.includes(id))throw Error('Chosen local model is not installed/listed');
 const start=Date.now();
 const json=await jsonRequest(origin+'/api/chat',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({model:id,stream:false,format:'json',options:{temperature:0.55},
   messages:[{role:'system',content:SYSTEM},{role:'user',content:brief}]})
 },transport,60000);
 if(typeof json?.message?.content!=='string')throw Error('Local model returned empty completion');
 let script;
 try{script=JSON.parse(json.message.content)}catch{throw Error('Local model did not return valid JSON script')}
 const qa=inspectScript(script);
 return{kind:'persona-local-ai-result',version:1,source:'real-local-ollama-completion',
  status:qa.pass?'STRUCTURE_PASS':'REVIEW_REQUIRED',model:id,createdAt:new Date().toISOString(),
  elapsedMs:Date.now()-start,usage:{promptTokens:json.prompt_eval_count??null,
  completionTokens:json.eval_count??null},qa,draft:script};
}
function parse(args){
 const out={};
 for(const a of args){if(a==='--probe'||a==='--run'||a==='--help'){out[a.slice(2)]=true;continue}
  const m=/^--(model|endpoint|brief-file|out)=(.+)$/.exec(a);
  if(!m)throw Error('Unknown argument '+a);
  out[m[1]]=m[2];
 }
 return out;
}
async function main(){
 const p=parse(process.argv.slice(2));
 if(p.help){console.log('node tools/persona-local-ai.mjs --probe | --run --model=qwen2.5-coder:7b [--brief-file=brief.txt] [--out=script.json]');return}
 const endpoint=p.endpoint||DEFAULT;
 if(!p.run){console.log(JSON.stringify({mode:'DISCOVERY_ONLY',models:await listModels(endpoint),completionExecuted:false},null,2));return}
 if(!p.model)throw Error('--model is required for real execution');
 const brief=p['brief-file']?await readFile(p['brief-file'],'utf8'):DEMO;
 const result=await runLocal({endpoint,model:p.model,brief});
 if(p.out)await writeFile(p.out,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({status:result.status,model:result.model,usage:result.usage,
   qa:result.qa,outputFile:p.out||null,realCompletionReceived:true},null,2));
 if(!result.qa.pass)process.exitCode=2;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(e=>{console.error('BLOCKED:',e instanceof Error?e.message:String(e));process.exitCode=1});
