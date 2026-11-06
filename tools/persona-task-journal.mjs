#!/usr/bin/env node
import {readFile,writeFile,rename,unlink,open} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {stat} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {validateTaskBoard,dispatch} from './persona-task-dispatcher.mjs';
const allowed={QUEUED:['READY','BLOCKED'],READY:['RUNNING','BLOCKED'],RUNNING:['DONE','FAILED','BLOCKED'],FAILED:['READY','BLOCKED'],BLOCKED:['READY'],DONE:[]};
export function transition(board,{id,to,evidence,note='',expectedRevision}={}){
 validateTaskBoard(board);const revision=board.revision??0;
 if(!Number.isInteger(revision)||revision<0||expectedRevision!==undefined&&expectedRevision!==revision)throw Error('Revision conflict');
 const task=board.tasks.find(t=>t.id===id);if(!task)throw Error('Unknown task');
 if(!allowed[task.status]?.includes(to))throw Error('Illegal transition '+task.status+' -> '+to);
 if((to==='READY'||to==='RUNNING')&&task.dependsOn.some(dep=>board.tasks.find(t=>t.id===dep)?.status!=='DONE'))throw Error('Dependencies incomplete');
 if(to==='DONE'&&(!evidence||typeof evidence!=='string'||evidence.trim().length<12))throw Error('DONE requires verification evidence');
 if(typeof note!=='string'||note.length>2000||(evidence!==undefined&&(typeof evidence!=='string'||evidence.length>4000)))throw Error('Invalid or oversized evidence');
 if(board.history!==undefined&&(!Array.isArray(board.history)||board.history.length!==revision||board.history.some((event,i)=>!event||event.sequence!==i+1||typeof event.taskId!=='string'||!board.tasks.some(t=>t.id===event.taskId))))throw Error('Invalid history');
 const next=structuredClone(board);next.revision=revision+1;next.tasks.find(t=>t.id===id).status=to;
 const event={sequence:next.revision,taskId:id,from:task.status,to,evidence:evidence??null,note,recordedAt:new Date().toISOString()};
 next.history=[...(next.history??[]),event];if(next.history.length>10000)throw Error('History too large');
 return {board:next,event};
}
export async function updateBoard({input,id,to,evidence,note,expectedRevision,evidenceFile}){
 const file=resolve(input),lock=file+'.lock';let handle;
 try{handle=await open(lock,'wx')}catch(e){if(e.code==='EEXIST')throw Error('Board locked');throw e}
 let temp;
 try{const raw=await readFile(file,'utf8');if(Buffer.byteLength(raw)>1000000)throw Error('Oversized board');
  let evidenceRecord=null;
  if(evidenceFile!==undefined){
   if(to!=='DONE')throw Error('Evidence file is only allowed for DONE');
   const artifact=resolve(evidenceFile),info=await stat(artifact);
   if(!info.isFile()||info.size===0||info.size>25_000_000)throw Error('Invalid evidence artifact');
   const bytes=await readFile(artifact);
   if(bytes.length!==info.size)throw Error('Evidence changed during read');
   evidenceRecord={kind:'LOCAL_FILE_HASH',fileName:artifact.split(/[\\/]/).pop(),sizeBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),qualityApproved:false};
  }
  const result=transition(JSON.parse(raw),{id,to,evidence,note,expectedRevision});
  if(to==='DONE'){
   const event=result.board.history.at(-1);
   event.evidenceVerification=evidenceRecord??{kind:'USER_TEXT_ONLY',verified:false};
   result.event.evidenceVerification=event.evidenceVerification;
  }
  temp=join(dirname(file),'.'+randomUUID()+'.tmp');await writeFile(temp,JSON.stringify(result.board,null,2)+'\n',{flag:'wx'});await rename(temp,file);temp=null;
  return {event:result.event,revision:result.board.revision};
 }finally{if(temp)await unlink(temp).catch(()=>{});await handle.close();await unlink(lock).catch(()=>{})}
}
export function recovery(board){
 validateTaskBoard(board);
 return {status:'HUMAN_REVIEW_REQUIRED',running:board.tasks.filter(t=>t.status==='RUNNING').map(t=>t.id),failed:board.tasks.filter(t=>t.status==='FAILED').map(t=>t.id),plan:dispatch(board),actionsExecuted:0};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2),flag=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1]};
 const input=flag('--input'),id=flag('--id'),to=flag('--to'),evidence=flag('--evidence'),revision=flag('--revision');
 if(!input||!id||!to||revision===undefined||!/^[0-9]+$/.test(revision)){console.error('Usage: npm run tasks:journal -- --input board.json --id TASK-001 --to RUNNING --revision 0 [--evidence proof]');process.exitCode=2}
 else updateBoard({input,id,to,evidence,expectedRevision:Number(revision),note:flag('--note')??'',evidenceFile:flag('--evidence-file')}).then(result=>console.log(JSON.stringify(result))).catch(e=>{console.error(e.message);process.exitCode=1});
}
