#!/usr/bin/env node
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const validStatuses=new Set(['QUEUED','READY','RUNNING','BLOCKED','DONE','FAILED']);
const agents={engineering:'coding-agent',marketing:'research-agent',production:'production-agent',review:'independent-reviewer'};
export function validateTaskBoard(board){
 if(board?.schemaVersion!==1||!Array.isArray(board.tasks)||board.tasks.length>5000)throw Error('Invalid task board');
 const ids=new Set();
 for(const t of board.tasks){
  if(!t||typeof t.id!=='string'||!/^[\w-]{1,80}$/.test(t.id)||ids.has(t.id))throw Error('Duplicate/invalid task ID');
  ids.add(t.id);
  if(!validStatuses.has(t.status)||!['P0','P1','P2','P3'].includes(t.priority)||!Object.hasOwn(agents,t.kind)||typeof t.title!=='string'||!t.title.trim()||typeof t.acceptance!=='string'||!t.acceptance.trim()||!Array.isArray(t.dependsOn)||t.dependsOn.some(d=>typeof d!=='string')||new Set(t.dependsOn).size!==t.dependsOn.length||(t.estimatedMinutes!==undefined&&(!Number.isInteger(t.estimatedMinutes)||t.estimatedMinutes<1||t.estimatedMinutes>10080)))throw Error('Invalid task '+t.id);
 }
 const map=new Map(board.tasks.map(t=>[t.id,t])),visiting=new Set(),done=new Set();
 function walk(id){if(visiting.has(id))throw Error('Dependency cycle '+id);if(done.has(id))return;const t=map.get(id);if(!t)throw Error('Unknown dependency '+id);visiting.add(id);for(const dep of t.dependsOn)walk(dep);visiting.delete(id);done.add(id)}
 for(const id of ids)walk(id);return map;
}
export function dispatch(board,{maxConcurrent=3}={}){
 const map=validateTaskBoard(board);if(!Number.isInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>20)throw Error('Invalid concurrency');
 const running=board.tasks.filter(t=>t.status==='RUNNING').length,slots=Math.max(0,maxConcurrent-running);
 const pending=board.tasks.filter(t=>['QUEUED','READY'].includes(t.status));
 const ready=pending.filter(t=>t.dependsOn.every(id=>map.get(id).status==='DONE')).sort((a,b)=>a.priority.localeCompare(b.priority)||(a.estimatedMinutes??10080)-(b.estimatedMinutes??10080)||a.id.localeCompare(b.id));
 return {schemaVersion:1,status:'PLAN_ONLY',selected:ready.slice(0,slots).map(t=>({id:t.id,title:t.title,priority:t.priority,executor:agents[t.kind],acceptance:t.acceptance,status:'SUGGESTED_NOT_EXECUTED'})),waiting:pending.filter(t=>!ready.slice(0,slots).includes(t)).map(t=>({id:t.id,waitingFor:t.dependsOn.filter(id=>map.get(id).status!=='DONE'),reason:ready.includes(t)?'CAPACITY':'DEPENDENCY'})),running,capacity:slots,actionsExecuted:0};
}
export async function run({input,output,maxConcurrent=3}){
 const raw=await readFile(resolve(input),'utf8');if(Buffer.byteLength(raw)>1000000)throw Error('Oversized board');
 const result=dispatch(JSON.parse(raw),{maxConcurrent});const dir=resolve(output);
 await mkdir(dir);
 try{
  await writeFile(join(dir,'dispatch.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  await writeFile(join(dir,'dispatch.md'),'# Life OS task dispatch\n\n'+result.selected.map(x=>'- '+x.id+': '+x.title+' → '+x.executor).join('\n')+'\n',{flag:'wx'});
 }catch(error){await rm(dir,{recursive:true,force:true}).catch(()=>{});throw error}
 return result;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2),flag=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1]};
 const input=flag('--input'),output=flag('--output'),limit=flag('--max-concurrent');
 if(!input||!output||input.startsWith('--')||output.startsWith('--')){console.error('Usage: npm run tasks:dispatch -- --input board.json --output new-directory [--max-concurrent 3]');process.exitCode=2}
 else run({input,output,maxConcurrent:limit===undefined?3:Number(limit)}).then(result=>console.log(JSON.stringify({selected:result.selected.length,waiting:result.waiting.length,output}))).catch(e=>{console.error(e.message);process.exitCode=1});
}
