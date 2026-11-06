#!/usr/bin/env node
/**
 * Dependency-free local smoke verification. Never contacts GitHub Actions,
 * installs packages, invokes paid APIs, merges, deploys or publishes.
 * Exit 0 only when every listed suite succeeds.
 */
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';

const root=resolve(import.meta.dirname,'..');
const git=(...args)=>spawnSync('git',args,{cwd:root,encoding:'utf8'});
const head=git('rev-parse','HEAD');
const sha=head.status===0?head.stdout.trim():'';
if(!/^[a-f0-9]{40}$/.test(sha)){
 console.error('BLOCKED: exact Git commit unavailable');process.exit(2);
}
const tree=git('status','--porcelain','--untracked-files=no');
if(tree.status!==0||tree.stdout.trim()){
 console.error('BLOCKED: tracked files have uncommitted changes');process.exit(2);
}
const suites=[
 ['task orchestration','tools/persona-task-operations.test.mjs'],
 ['artifact evidence','tools/persona-evidence.test.mjs'],
 ['local execution','tools/persona-local-executor.test.mjs'],
 ['local batch','tools/persona-local-batch.test.mjs'],
 ['Remotion handoff','tools/persona-remotion-handoff.test.mjs'],
 ['Remotion stage','tools/persona-remotion-stage.test.mjs'],
 ['task orchestration CLI','tools/persona-orchestration-e2e.test.mjs'],
 ['release gate','tools/persona-release-gate.test.mjs'],
 ['marketing audit','tools/persona-marketing-audit.test.mjs'],
 ['marketing planning','tools/persona-experiment-planner.test.mjs'],
 ['marketing production','tools/persona-marketing-production.test.mjs'],
 ['production brief','tools/persona-production-brief.test.mjs']
];
const startedAt=new Date().toISOString(),results=[];
for(const [name,file] of suites){
 const start=Date.now();
 const run=spawnSync(process.execPath,['--test',file],{cwd:root,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
 const status=run.error?'EXECUTION_ERROR':run.status===0?'PASS':'FAIL';
 results.push({name,file,status,exitCode:run.status,durationMs:Date.now()-start,
  output:(run.stdout??'').slice(-12000),stderr:(run.stderr??'').slice(-12000),
  error:run.error?.message??null});
 console.log(name+': '+status);
 if(status!=='PASS')break;
}
const overall=results.length===suites.length&&results.every(x=>x.status==='PASS')?'PASS':'FAIL';
const report={schemaVersion:1,kind:'LOCAL_SMOKE_ONLY',commit:sha,startedAt,finishedAt:new Date().toISOString(),
 node:process.version,platform:process.platform,overall,complete:results.length===suites.length,
 requiredSuites:suites.map(x=>x[0]),results,mergeApproved:false,publicationApproved:false};
const dir=join(root,'artifacts','persona-local-verification',new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID());
mkdirSync(dir,{recursive:true});
writeFileSync(join(dir,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log('Local smoke: '+overall+'; report: '+dir);
console.log('This smoke report is NOT a full release-gate report.');
process.exit(overall==='PASS'?0:1);
