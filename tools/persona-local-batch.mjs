#!/usr/bin/env node
/**
 * Explicit opt-in, sequential, offline batch execution of allowlisted test tasks.
 * No autonomous retries, paid AI calls, merges or publishing.
 */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {dispatch} from './persona-task-dispatcher.mjs';
import {validateExecution,executeLocalTest} from './persona-local-executor.mjs';
import {updateBoard} from './persona-task-journal.mjs';

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
 else runBatch({input,output,maxTasks:limit===undefined?10:Number(limit)})
  .then(x=>{console.log(JSON.stringify(x));if(x.status!=='COMPLETED_WITHIN_LIMIT')process.exitCode=1})
  .catch(e=>{console.error(e.message);process.exitCode=1});
}
