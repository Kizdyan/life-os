#!/usr/bin/env node
/**
 * Explicit opt-in offline executor for a single allowlisted Node test task.
 * No shell, network, arbitrary commands, paid agents, merge or publishing.
 */
import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {validateTaskBoard} from './persona-task-dispatcher.mjs';
import {updateBoard} from './persona-task-journal.mjs';

const root=resolve(import.meta.dirname,'..');
const allowlist=new Set([
 'tools/persona-task-operations.test.mjs',
 'tools/persona-orchestration-e2e.test.mjs',
 'tools/persona-release-gate.test.mjs',
 'tools/persona-evidence.test.mjs',
 'tools/persona-marketing-audit.test.mjs',
 'tools/persona-experiment-planner.test.mjs',
 'tools/persona-marketing-production.test.mjs',
 'tools/persona-production-brief.test.mjs'
]);
export function validateExecution(task){
 if(!task||task.kind!=='engineering'||task.execution?.type!=='node-test'||!allowlist.has(task.execution.file))
  throw Error('Task execution not explicitly allowlisted');
 return task.execution.file;
}
export async function executeLocalTest({input,id,output,expectedRevision,timeoutMs=120000}={}){
 if(!Number.isInteger(expectedRevision)||expectedRevision<0)throw Error('Expected board revision required');
 if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>120000)throw Error('Invalid timeout');
 const file=resolve(input),dir=resolve(output);
 const board=JSON.parse(await readFile(file,'utf8'));
 validateTaskBoard(board);
 if((board.revision??0)!==expectedRevision)throw Error('Revision conflict');
 const task=board.tasks.find(x=>x.id===id);
 if(!task||task.status!=='READY')throw Error('Task must be READY');
 if(task.dependsOn.some(dep=>board.tasks.find(x=>x.id===dep)?.status!=='DONE'))throw Error('Dependencies incomplete');
 const script=validateExecution(task);
 const absolute=resolve(root,script);
 if(isAbsolute(script)||relative(root,absolute).startsWith('..'))throw Error('Invalid script path');
 // Reserve output before any execution, never overwrite previous evidence.
 await mkdir(dir);
 const startedAt=new Date().toISOString();
 let execution;
 try{
  const running=await updateBoard({input:file,id,to:'RUNNING',expectedRevision});
  const result=spawnSync(process.execPath,['--test',absolute],{
   cwd:root,encoding:'utf8',timeout:timeoutMs,maxBuffer:4*1024*1024,
   env:{...process.env,CI:'true'}
  });
  const success=!result.error&&result.status===0;
  execution={schemaVersion:1,kind:'LOCAL_NODE_TEST',taskId:id,script,startedAt,
   finishedAt:new Date().toISOString(),status:success?'PASS':'FAIL',
   exitCode:result.status,error:result.error?.message??null,
   stdout:(result.stdout??'').slice(-100000),stderr:(result.stderr??'').slice(-100000),
   command:['node','--test',script],shellUsed:false,qualityApproved:false};
  const proof=join(dir,'execution.json');
  await writeFile(proof,JSON.stringify(execution,null,2)+'\n',{flag:'wx'});
  const next=await updateBoard({input:file,id,to:success?'DONE':'FAILED',
   expectedRevision:running.revision,evidence:success?'Allowlisted local test exited successfully':undefined,
   note:success?'Local test completed':'Local test failed; inspect execution.json',
   evidenceFile:success?proof:undefined});
  return {...execution,revision:next.revision,reportSha256:createHash('sha256').update(JSON.stringify(execution)).digest('hex')};
 }catch(error){
  // A RUNNING task is intentionally not retried or marked DONE on infrastructure failure.
  await writeFile(join(dir,'executor-error.json'),JSON.stringify({taskId:id,error:error.message,at:new Date().toISOString()},null,2)+'\n',{flag:'wx'}).catch(()=>{});
  throw error;
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2),flag=x=>{const i=args.indexOf(x);return i<0?undefined:args[i+1]};
 const input=flag('--input'),id=flag('--id'),output=flag('--output'),revision=flag('--revision');
 if(!input||!id||!output||revision===undefined||!/^[0-9]+$/.test(revision)){
  console.error('Usage: node tools/persona-local-executor.mjs --input BOARD --id TASK --output NEW_DIRECTORY --revision N');
  process.exitCode=2;
 }else executeLocalTest({input,id,output,expectedRevision:Number(revision)})
  .then(x=>{console.log(JSON.stringify({taskId:id,status:x.status,revision:x.revision}));if(x.status!=='PASS')process.exitCode=1})
  .catch(e=>{console.error(e.message);process.exitCode=1});
}
