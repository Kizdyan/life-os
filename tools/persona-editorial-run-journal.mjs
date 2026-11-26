/** Durable idempotency for paid editorial cycles. Never replay an ambiguous call.
 * One immutable claim per run ID; completed results replay without provider calls.
 * An interrupted claim requires reconciliation, not automatic resumption. */
import {mkdir,readFile,writeFile,rename,open,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {normalizeEditorialPipelineRequest} from './persona-carousel-editorial-pipeline.mjs';
const idPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const safeId=id=>{if(typeof id!=='string'||!idPattern.test(id))throw Error('Нужен UUID редакционного запуска');return id};
const directory=(root,id)=>join(root,'editorial-run-'+safeId(id));
async function readOptional(file){
 try{return JSON.parse(await readFile(file,'utf8'))}catch(e){if(e.code==='ENOENT')return null;throw Error('Журнал редакционного запуска повреждён или недоступен')}
}
async function durableWrite(file,data){
 const h=await open(file,'wx');
 try{await h.writeFile(JSON.stringify(data,null,2));await h.sync()}finally{await h.close()}
}
export async function readEditorialRun(root,id){
 const dir=directory(root,id),claim=await readOptional(join(dir,'claim.json'));
 if(!claim)return null;
 if(claim.version!==1||claim.runId!==id||!/^([a-f0-9]{64})$/.test(claim.requestHash)||![2,4].includes(claim.maxCalls))throw Error('Некорректный журнал редакционного запуска');
 const result=await readOptional(join(dir,'result.json'));
 if(result){
  if(result.runId!==id||result.approved!==false||result.published!==false||result.calls>claim.maxCalls)throw Error('Некорректный результат редакционного запуска');
  return {claim,result};
 }
 const checkpoints=(await readdir(dir)).filter(n=>/^call-[1-4]-started\.json$/.test(n)).sort();
 return {claim,result:null,checkpoints};
}
export async function claimEditorialRun(root,id,request){
 const input=normalizeEditorialPipelineRequest(request),requestHash=digest(input),dir=directory(root,id);
 await mkdir(root,{recursive:true});
 try{await mkdir(dir)}catch(e){
  if(e.code!=='EEXIST')throw e;
  const existing=await readEditorialRun(root,id);
  if(!existing)throw Error('Неполная запись запуска: требуется сверка, повтор запрещён');
  if(existing.claim.requestHash!==requestHash)throw Error('UUID уже привязан к другому заданию');
  return {claimed:false,...existing};
 }
 const claim={version:1,runId:id,requestHash,maxCalls:input.maxCalls,createdAt:new Date().toISOString(),request:input};
 await durableWrite(join(dir,'claim.json'),claim);
 return {claimed:true,claim,result:null};
}
export async function recordEditorialCall(root,id,call,stage){
 if(!Number.isInteger(call)||call<1||call>4||!['research','revision','independent-review'].includes(stage))throw Error('Некорректный этап редакционного запуска');
 await durableWrite(join(directory(root,id),'call-'+call+'-started.json'),{call,stage,startedAt:new Date().toISOString()});
}
export async function finishEditorialRun(root,id,result){
 const dir=directory(root,id),existing=await readEditorialRun(root,id);
 if(!existing||existing.result||result.approved!==false||result.published!==false||result.calls>existing.claim.maxCalls)throw Error('Нельзя перезаписать редакционный запуск');
 const final={...result,runId:id};
 await durableWrite(join(dir,'result.tmp'),final);
 await rename(join(dir,'result.tmp'),join(dir,'result.json'));
 return final;
}
export function editorialRunResponse(run,id,active=false){
 if(!run)return {version:1,runId:id,status:'NOT_FOUND',approved:false,published:false};
 if(run.result)return run.result;
 return {version:1,runId:id,status:active?'RUNNING':'RECONCILIATION_REQUIRED',callsPossiblyStarted:run.checkpoints?.length??0,maxCalls:run.claim.maxCalls,approved:false,published:false};
}
