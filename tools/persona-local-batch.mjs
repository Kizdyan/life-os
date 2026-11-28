#!/usr/bin/env node
/**
 * Explicit opt-in, sequential, offline batch execution of allowlisted test tasks.
 * No autonomous retries, paid AI calls, merges or publishing.
 */
import {readFile,mkdir,writeFile,rename,unlink,statfs} from 'node:fs/promises';
import {freemem} from 'node:os';
import {randomUUID} from 'node:crypto';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {dispatch} from './persona-task-dispatcher.mjs';
import {validateExecution,executeLocalTest} from './persona-local-executor.mjs';
import {updateBoard} from './persona-task-journal.mjs';
import {lockProductionSchedule} from './persona_orchestrator.mjs';

/** Night mode is an adapter over the SAME board, dispatcher, journal and executor.
 * It cannot grant creative approvals, publish, install tools or execute arbitrary commands. */
export function nightResourceGuard(sample){
 const reasons=[];
 for(const [key,min,reason] of [['availableRamBytes',4*1024**3,'RAM_LOW'],['systemDiskFreeBytes',1024**3,'SYSTEM_DISK_LOW'],['workingDiskFreeBytes',10*1024**3,'WORKING_DISK_LOW']])
  if(!Number.isFinite(sample?.[key])||sample[key]<min)reasons.push(reason);
 if(!Number.isInteger(sample?.loadedHeavyModels)||sample.loadedHeavyModels<0||sample.loadedHeavyModels>1)reasons.push('MULTIPLE_HEAVY_MODELS');
 return {status:reasons.length?'BLOCKED':'PASS',reasons};
}
async function probeNightResources(output){
 const disk=async path=>{const s=await statfs(path);return s.bavail*s.bsize};
 // Unknown local inference status blocks unattended work instead of guessing.
 let heavy=0;
 for(const port of [11434,11435]){
  try{const r=await fetch(`http://127.0.0.1:${port}/api/ps`,{signal:AbortSignal.timeout(3000),redirect:'error'});if(!r.ok)throw Error('Inference status unavailable');const data=await r.json();if(!Array.isArray(data.models))throw Error('Invalid inference status');heavy+=data.models.filter(m=>Number(m.size)>8*1024**3).length}
  catch(e){if(!['ECONNREFUSED'].includes(e.cause?.code))throw e}
 }
 return {availableRamBytes:freemem(),systemDiskFreeBytes:await disk(process.platform==='win32'?(process.env.SystemDrive??'C:')+'/':'/'),workingDiskFreeBytes:await disk(output),loadedHeavyModels:heavy};
}
export async function recoverNightTasks({input}){
 const board=JSON.parse(await readFile(input,'utf8'));dispatch(board,{maxConcurrent:1});let revision=board.revision??0;
 for(const task of board.tasks.filter(t=>t.status==='RUNNING')){
  const result=await updateBoard({input,id:task.id,to:'BLOCKED',expectedRevision:revision,note:'Interrupted execution retained for inspection; no automatic duplicate inference or side effects'});revision=result.revision;
 }
}
async function saveNight(path,value){const temp=path+'.'+randomUUID()+'.tmp';try{await writeFile(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx'});await rename(temp,path)}finally{await unlink(temp).catch(()=>{})}}
export async function runNightBatch({input,output,maxTasks=50,maxDurationMs=12*3600000,resourceProbe=probeNightResources}={}){
 if(!Number.isInteger(maxTasks)||maxTasks<1||maxTasks>50||!Number.isInteger(maxDurationMs)||maxDurationMs<1000||maxDurationMs>12*3600000)throw Error('Invalid bounded night limits');
 const boardPath=resolve(input),out=resolve(output);await mkdir(out,{recursive:true});
 const lockPath=join(out,'.night.lock'),lock=await lockProductionSchedule(lockPath),runId=randomUUID(),start=Date.now();
 const state={schemaVersion:1,kind:'EXISTING_LOCAL_BATCH_NIGHT',runId,pid:process.pid,startedAt:new Date().toISOString(),status:'RUNNING',executed:0,results:[],publicationApproved:false,mergeApproved:false};
 let heartbeat=null,writing=Promise.resolve();
 const snapshot=()=>{writing=writing.then(()=>saveNight(join(out,'night-state.json'),{...state,heartbeatAt:new Date().toISOString()}));return writing};
 try{
  const sample=await resourceProbe(out),guard=nightResourceGuard(sample);state.resources=sample;
  if(guard.status!=='PASS'){state.status='RESOURCE_BLOCKED';state.reasons=guard.reasons;await snapshot();return state}
  await recoverNightTasks({input:boardPath});await snapshot();heartbeat=setInterval(()=>{void snapshot().catch(()=>{})},5000);
  for(let i=0;i<maxTasks&&Date.now()-start<maxDurationMs;i++){
   try{const stop=JSON.parse(await readFile(join(out,'STOP'),'utf8'));if(stop.kind!=='persona-night-stop-v1'||typeof stop.requested!=='boolean')throw Error('Invalid stop marker retained for inspection');if(stop.requested){state.status='STOPPED';break}}catch(e){if(e.code!=='ENOENT')throw e}
   const currentGuard=nightResourceGuard(await resourceProbe(out));if(currentGuard.status!=='PASS'){state.status='RESOURCE_BLOCKED';state.reasons=currentGuard.reasons;break}
   const board=JSON.parse(await readFile(boardPath,'utf8')),selected=dispatch(board,{maxConcurrent:1}).selected[0];if(!selected)break;
   const task=board.tasks.find(t=>t.id===selected.id);let revision=board.revision??0;
   try{validateExecution(task)}catch{
    const r=await updateBoard({input:boardPath,id:task.id,to:'BLOCKED',expectedRevision:revision,note:'Capability unavailable: no explicitly allowlisted local executor. No cloud fallback.'});
    state.results.push({id:task.id,status:'BLOCKED_CAPABILITY',revision:r.revision});await snapshot();continue;
   }
   const attempts=(board.history??[]).filter(h=>h.taskId===task.id&&h.to==='RUNNING').length;
   if(attempts>=2){await updateBoard({input:boardPath,id:task.id,to:'BLOCKED',expectedRevision:revision,note:'Two-attempt ceiling reached; explicit inspection required'});continue}
   if(task.status==='QUEUED')revision=(await updateBoard({input:boardPath,id:task.id,to:'READY',expectedRevision:revision})).revision;
   const result=await executeLocalTest({input:boardPath,id:task.id,output:join(out,runId+'-'+task.id),expectedRevision:revision,timeoutMs:Math.min(120000,Math.max(1000,maxDurationMs-(Date.now()-start)))});
   state.executed++;state.results.push({id:task.id,status:result.status});await snapshot();
  }
  if(state.status==='RUNNING')state.status='FINISHED';state.elapsedMs=Date.now()-start;await snapshot();
  await writeFile(join(out,'morning-'+runId+'.md'),'# Local night run\n\n'+state.status+'\n\n'+state.results.map(r=>'- '+r.id+': '+r.status).join('\n')+'\n\nTechnical execution only. No author approval or publication.\n',{flag:'wx'});
  return state;
 }finally{if(heartbeat)clearInterval(heartbeat);await writing.catch(()=>{});await lock.close();await unlink(lockPath)}
}

export async function runBatch({input,output,maxTasks=10}={}){
 if(!Number.isInteger(maxTasks)||maxTasks<1||maxTasks>50)throw Error('Invalid batch limit');
 const boardPath=resolve(input),out=resolve(output);
 const initial=JSON.parse(await readFile(boardPath,'utf8'));
 // Preflight before reserving output: reject any initially runnable task
 // without explicit local execution metadata.
 const first=dispatch(initial,{maxConcurrent:1});
 for(const item of first.selected)validateExecution(initial.tasks.find(t=>t.id===item.id));
 await mkdir(out);
 const results=[];
 for(let i=0;i<maxTasks;i++){
  const board=JSON.parse(await readFile(boardPath,'utf8'));
  const plan=dispatch(board,{maxConcurrent:1});
  if(!plan.selected.length)break;
  const item=plan.selected[0],task=board.tasks.find(t=>t.id===item.id);
  try{validateExecution(task)}
  catch(error){results.push({id:item.id,status:'BLOCKED_UNSUPPORTED',error:error.message});break}
  try{
   let revision=board.revision??0;
   if(task.status==='QUEUED'){
    const ready=await updateBoard({input:boardPath,id:item.id,to:'READY',expectedRevision:revision});
    revision=ready.revision;
   }
   const result=await executeLocalTest({input:boardPath,id:item.id,output:join(out,'task-'+String(i+1).padStart(3,'0')),expectedRevision:revision});
   results.push({id:item.id,status:result.status,revision:result.revision});
   if(result.status!=='PASS')break;
  }catch(error){results.push({id:item.id,status:'EXECUTION_ERROR',error:error.message});break}
 }
 const summary={schemaVersion:1,kind:'LOCAL_BATCH',results,executed:results.filter(x=>['PASS','FAIL'].includes(x.status)).length,
  status:results.some(x=>x.status!=='PASS')?'STOPPED_FOR_REVIEW':'COMPLETED_WITHIN_LIMIT',
  mergeApproved:false,publicationApproved:false};
 await writeFile(join(out,'batch-summary.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
 return summary;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2),flag=x=>{const i=args.indexOf(x);return i<0?undefined:args[i+1]};
 const input=flag('--input'),output=flag('--output'),limit=flag('--max-tasks');
 if(!input||!output){console.error('Usage: node tools/persona-local-batch.mjs --input BOARD --output NEW_DIRECTORY [--max-tasks 10]');process.exitCode=2}
 else (args.includes('--night')?runNightBatch:runBatch)({input,output,maxTasks:limit===undefined?10:Number(limit)})
  .then(x=>{console.log(JSON.stringify(x));if(!['COMPLETED_WITHIN_LIMIT','FINISHED','STOPPED'].includes(x.status))process.exitCode=1})
  .catch(e=>{console.error(e.message);process.exitCode=1});
}
