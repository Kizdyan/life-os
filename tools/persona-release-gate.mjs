#!/usr/bin/env node
/**
 * Fail-closed release evidence gate. Does not execute commands or publish.
 * An independently generated verification report must match the exact Git SHA.
 */
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const required=['typecheck','api:typecheck','test','web:build','persona:core:test','persona:scenario:delivery:test','skills:validate','marketing:test','tasks:test','evidence:test','tasks:execute:test','release:gate:test','tasks:e2e:test','production:brief:test'];
export function evaluateRelease(report,{expectedSha,requiredScripts=required}={}){
 const errors=[];
 if(report?.schemaVersion!==1)errors.push('Invalid verification report schema');
 if(typeof report?.startedAt!=='string'||!Number.isFinite(Date.parse(report.startedAt))||typeof report?.finishedAt!=='string'||!Number.isFinite(Date.parse(report.finishedAt))||Date.parse(report.finishedAt)<Date.parse(report.startedAt))errors.push('Invalid verification timestamps');
 if(typeof report?.node!=='string'||!/^v[0-9]+\./.test(report.node))errors.push('Missing Node runtime provenance');
 if(!/^[a-f0-9]{40}$/.test(expectedSha??''))errors.push('Expected exact 40-character Git SHA required');
 if(!report||typeof report!=='object'||report.dryRun!==false)errors.push('Dry-run or missing report');
 if(report?.commit!==expectedSha)errors.push('Commit mismatch');
 if(report?.overall!=='PASS')errors.push('Verification did not PASS');
 if(!Array.isArray(report?.results))errors.push('Missing execution results');
 if(report?.kind==='LOCAL_SMOKE_ONLY')errors.push('Smoke report cannot authorize release review');
 const scriptLabels={'typecheck':'typecheck','api:typecheck':'api:typecheck','unit tests':'test','web build':'web:build','Persona core regressions':'persona:core:test','Persona scenario and delivery regressions':'persona:scenario:delivery:test','Workflow skill validation':'skills:validate','Persona marketing audit regressions':'marketing:test','Life OS task orchestration regressions':'tasks:test','Local artifact evidence regressions':'evidence:test','Local task executor regressions':'tasks:execute:test','Release evidence gate regressions':'release:gate:test','Task orchestration end-to-end CLI':'tasks:e2e:test','Persona production brief regressions':'production:brief:test'};
 const results=Array.isArray(report?.results)?report.results:[];
 for(const script of requiredScripts){
  const matching=results.filter(r=>scriptLabels[r?.name]===script);
  if(matching.length!==1||matching[0].status!=='PASS'||matching[0].exitCode!==0||!Number.isFinite(matching[0].durationMs)||matching[0].durationMs<0)errors.push('Missing or unverified gate: '+script);
 }
 return {schemaVersion:1,status:errors.length?'BLOCKED':'ELIGIBLE_FOR_HUMAN_REVIEW',expectedSha,errors,verifiedGates:requiredScripts.length,publicationApproved:false,mergeApproved:false,actionsExecuted:0};
}
export async function run({input,output,sha}){
 const raw=await readFile(resolve(input),'utf8');if(Buffer.byteLength(raw)>2000000)throw Error('Verification report exceeds size limit');
 const result=evaluateRelease(JSON.parse(raw),{expectedSha:sha});
 const dir=resolve(output);await mkdir(dir);
 const envelope={...result,reportSha256:createHash('sha256').update(raw).digest('hex')};
 try{await writeFile(join(dir,'release-gate.json'),JSON.stringify(envelope,null,2)+'\n',{flag:'wx'})}
 catch(error){await rm(dir,{recursive:true,force:true}).catch(()=>{});throw error}
 return envelope;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2),flag=k=>{const i=args.indexOf(k);return i<0?undefined:args[i+1]};
 const input=flag('--input'),output=flag('--output'),sha=flag('--sha');
 if(!input||!output||!sha){console.error('Usage: node tools/persona-release-gate.mjs --input artifacts/persona-verification/latest.json --sha FULL_SHA --output new-dir');process.exitCode=2}
 else run({input,output,sha}).then(x=>{console.log(JSON.stringify(x));if(x.status!=='ELIGIBLE_FOR_HUMAN_REVIEW')process.exitCode=1}).catch(e=>{console.error(e.message);process.exitCode=1});
}
