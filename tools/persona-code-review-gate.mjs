#!/usr/bin/env node
/**
 * Independent, local-only review of a Persona CODE CHANGE (not creative ideas).
 *
 * Never edits code, invokes paid APIs, approves deployment or claims product QA.
 * Uses only a pinned Git diff, local Ollama and optionally the existing Observer
 * release report for the EXACT same commit.
 *
 * Example (Windows, from the repository root):
 * node tools/persona-code-review-gate.mjs --base main --model qwen3:4b-instruct --out artifacts/persona-review/my-first-review
 */
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {evaluateRelease} from './persona-release-gate.mjs';

const fail=message=>{throw Error('Persona independent code review: '+message)};
const sha256=value=>createHash('sha256').update(value).digest('hex');
const permitted=/^(apps\/web\/src\/|api\/|packages\/core\/src\/|tools\/|scripts\/)/;
const codeFile=/\.(?:tsx?|mjs|cjs|jsx?|css)$/;
const forbidden=/(?:^|\/)(?:\.env(?:\.[^/]*)?|private|secrets|credentials|node_modules)(?:\/|\.|$)|\.(?:pem|key|p12)$/i;
const disclosure=/(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9_]{15,}|sk-[A-Za-z0-9_-]{20,})/;
const severities=new Set(['BLOCKER','MAJOR','MINOR']);
const statusValues=new Set(['PASS','NEEDS_FIX','BLOCKED','UNVERIFIED']);
const isText=(s,min=8,max=1500)=>typeof s==='string'&&s.trim().length>=min&&s.length<=max;

function git(args){
 const r=spawnSync('git',args,{encoding:'utf8',maxBuffer:3*1024*1024});
 if(r.error||r.status!==0)fail('git '+args[0]+' failed: '+String(r.stderr||r.error?.message||'unknown').slice(0,300));
 return r.stdout.trim();
}
export function allowedSourcePath(path){
 return typeof path==='string'&&permitted.test(path)&&codeFile.test(path)&&
   !forbidden.test(path)&&!path.includes('..')&&!path.includes('\\');
}
export function validateCritique(raw,changedFiles){
 const issues=raw?.issues;
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||!Array.isArray(issues)||issues.length>12)
  fail('Model response must contain up to 12 issues');
 const seen=new Set();
 return issues.map((issue,index)=>{
  if(!issue||typeof issue!=='object'||!severities.has(issue.severity)||
   !changedFiles.includes(issue.file)||!Number.isInteger(issue.line)||issue.line<1||
   !isText(issue.problem,12,1200)||!isText(issue.evidence,12,1200)||
   !isText(issue.reproduce,12,1200)||!isText(issue.suggestedFix,8,1200))
   fail('Unverifiable or malformed issue '+(index+1));
  const key=issue.file+':'+issue.line+':'+issue.problem.toLowerCase();
  if(seen.has(key))fail('Duplicate issue reported');seen.add(key);
  return {severity:issue.severity,file:issue.file,line:issue.line,
   problem:issue.problem.trim(),evidence:issue.evidence.trim(),
   reproduce:issue.reproduce.trim(),suggestedFix:issue.suggestedFix.trim(),
   independentlyReproduced:false};
 });
}
export function determineGate({reviews=[],observer=null}={}){
 if(!Array.isArray(reviews)||reviews.length===0)return {status:'UNVERIFIED',reason:'No independent model review'};
 if(reviews.some(x=>!Array.isArray(x.issues)))return {status:'UNVERIFIED',reason:'Incomplete independent review'};
 const issues=reviews.flatMap(x=>x.issues);
 if(issues.some(x=>x.severity==='BLOCKER'||x.severity==='MAJOR'))
  return {status:'NEEDS_FIX',reason:'Unconfirmed significant model findings require reproduction; not automatic proof of a bug'};
 if(!observer)return {status:'UNVERIFIED',reason:'Observer report for exact commit has not been supplied'};
 if(observer.status!=='ELIGIBLE_FOR_HUMAN_REVIEW')
  return {status:'BLOCKED',reason:'Independent tool verification did not pass'};
 return {status:'PASS',reason:'No significant reported code issues and existing Observer release checks passed; human/product acceptance still required'};
}
function validateModel(model){
 if(typeof model!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,120}$/.test(model))fail('Invalid local model ID');
 return model;
}
async function reviewWithOllama({model,patch,files,fetchImpl=fetch}){
 const origin='http://127.0.0.1:11434';
 const tagsResponse=await fetchImpl(origin+'/api/tags',{signal:AbortSignal.timeout(15000)});
 if(!tagsResponse.ok)fail('Ollama is not reachable on Windows localhost');
 const tags=await tagsResponse.json();
 const present=Array.isArray(tags.models)&&tags.models.some(x=>x.name===model||x.model===model);
 if(!present)fail('Model is not installed in local Ollama: '+model);
 const system='Ты независимый строгий инженерный рецензент. Тебе НЕ предоставлена самооценка автора кода. Анализируй только фактический Git diff и требования. Ищи потерю состояния, ошибки TypeScript, несовместимые контракты, нарушения приватности и ложные признаки готовности. НЕ выдумывай проблемы. Если конкретных ошибок не обнаружил, верни пустой issues. Не делай утверждений о запуске тестов или рендера. Верни только JSON: {"issues":[{"severity":"BLOCKER|MAJOR|MINOR","file":"точный путь файла из списка","line":1,"problem":"конкретная проблема","evidence":"цитата или фрагмент изменённого кода","reproduce":"проверяемый способ подтверждения","suggestedFix":"минимальное исправление"}]}. Каждый пункт обязан ссылаться на реальный изменённый файл.';
 const started=Date.now();
 const response=await fetchImpl(origin+'/api/chat',{method:'POST',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({model,stream:false,format:'json',
   messages:[{role:'system',content:system},{role:'user',content:JSON.stringify({
    scope:'Persona existing code integration; no main or production changes',
    constraints:'Preserve existing user-approved media and five-stage state, no invented MP4 or publication',
    changedFiles:files,patch})}],options:{temperature:0.1,num_predict:1800}}),
  signal:AbortSignal.timeout(180000)});
 if(!response.ok)fail('Local model returned HTTP '+response.status);
 const json=await response.json();
 if(typeof json?.message?.content!=='string'||!json.message.content.trim())fail('Local model returned no content');
 let reply;try{reply=JSON.parse(json.message.content)}catch{fail('Local model returned invalid JSON')}
 return {model,transport:'OLLAMA_LOCAL_ONLY',durationMs:Date.now()-started,
  issues:validateCritique(reply,files)};
}
export function safeChangedFiles(paths){
 if(!Array.isArray(paths)||!paths.length)fail('No changed files to review');
 const unapproved=paths.filter(path=>!allowedSourcePath(path));
 if(unapproved.length)fail('Review scope includes unapproved paths: '+unapproved.slice(0,5).join(', '));
 return paths;
}
export async function run({base='main',model='qwen3:4b-instruct',secondModel,outputDir,observerReport,fetchImpl=fetch}){
 if(!isText(outputDir,1,1000))fail('Use --out NEW_DIRECTORY');
 validateModel(model);
 if(secondModel){
  validateModel(secondModel);
  if(secondModel.toLowerCase()===model.toLowerCase())fail('Second judge must be a different installed model');
 }
 if(!/^[A-Za-z0-9._/-]+$/.test(base)||base.includes('..'))fail('Invalid base Git ref');
 const head=git(['rev-parse','HEAD']);
 if(!/^[0-9a-f]{40}$/.test(head))fail('Cannot establish exact Git HEAD');
 if(git(['status','--porcelain','--untracked-files=no']))fail('Tracked worktree is dirty; commit or isolate changes first');
 const diffRange=base+'...HEAD';
 const paths=safeChangedFiles(git(['diff','--name-only','--diff-filter=ACM',diffRange,'--',
   'apps/web/src','api','packages/core/src','tools','scripts']).split('\n').filter(Boolean));
 const patch=git(['-c','core.quotePath=false','diff','--no-ext-diff','--no-color','--unified=4',diffRange,'--',...paths]);
 if(!patch||Buffer.byteLength(patch)>28000)fail('Diff empty or exceeds 28 KB; review smaller coherent commit range');
 if(disclosure.test(patch))fail('Possible secret in diff; refusing model call');
 const models=[model,...(secondModel?[secondModel]:[])];
 const reviews=[];
 for(const id of models)reviews.push(await reviewWithOllama({model:id,patch,files:paths,fetchImpl}));
 let observer=null;
 if(observerReport){
  const raw=await readFile(resolve(observerReport),'utf8');
  if(Buffer.byteLength(raw)>2000000)fail('Observer report too large');
  observer=evaluateRelease(JSON.parse(raw),{expectedSha:head});
 }
 const gate=determineGate({reviews,observer});
 if(!statusValues.has(gate.status))fail('Invalid gate status');
 const report={schemaVersion:1,kind:'persona-independent-code-review-v1',
  generatedAt:new Date().toISOString(),headSha:head,baseRef:base,
  diffSha256:sha256(patch),changedFiles:paths,reviewers:reviews,
  observerStatus:observer?.status??'NOT_RUN',
  observerErrors:observer?.errors??[],
  verdict:{...gate,modelFindingsAreUnconfirmed:true,humanAcceptanceRequired:true,
   publicationApproved:false,productionReady:false,actionsExecuted:0}};
 const directory=resolve(outputDir);
 await mkdir(directory,{recursive:true});
 await writeFile(join(directory,'code-review.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 return {reportPath:join(directory,'code-review.json'),commit:head,status:gate.status,
  reviewers:reviews.map(r=>({model:r.model,issues:r.issues.length,durationMs:r.durationMs})),
  observerStatus:report.observerStatus};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const argv=process.argv.slice(2),flag=k=>{const i=argv.indexOf(k);return i<0?undefined:argv[i+1]};
 const outputDir=flag('--out'),base=flag('--base')??'main',model=flag('--model')??'qwen3:4b-instruct';
 if(!outputDir){console.error('Usage: node tools/persona-code-review-gate.mjs --base main --model qwen3:4b-instruct --out NEW_DIRECTORY [--second-model ANOTHER_LOCAL_MODEL] [--observer-report artifacts/persona-verification/latest.json]');process.exitCode=2}
 else run({base,model,secondModel:flag('--second-model'),outputDir,
  observerReport:flag('--observer-report')}).then(x=>{
  console.log(JSON.stringify(x,null,2));
  if(x.status!=='PASS')process.exitCode=1;
 }).catch(e=>{console.error(String(e?.message||e));process.exitCode=2});
}
