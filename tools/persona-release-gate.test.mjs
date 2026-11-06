import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateRelease} from './persona-release-gate.mjs';
const sha='a'.repeat(40);
const names=['typecheck','api:typecheck','unit tests','web build','Persona core regressions','Persona scenario and delivery regressions','Workflow skill validation','Persona marketing audit regressions','Life OS task orchestration regressions','Release evidence gate regressions','Task orchestration end-to-end CLI','Persona production brief regressions'];
const report=()=>({schemaVersion:1,startedAt:'2026-11-07T00:00:00.000Z',finishedAt:'2026-11-07T00:01:00.000Z',node:'v22.16.0',commit:sha,overall:'PASS',dryRun:false,results:names.map(name=>({name,status:'PASS',exitCode:0,durationMs:1}))});
test('exact complete independent report is review-eligible, not auto-merged',()=>{const x=evaluateRelease(report(),{expectedSha:sha});assert.equal(x.status,'ELIGIBLE_FOR_HUMAN_REVIEW');assert.equal(x.mergeApproved,false)});
test('dry-run, stale SHA and absent gates fail closed',()=>{assert.equal(evaluateRelease({...report(),dryRun:true},{expectedSha:sha}).status,'BLOCKED');assert.equal(evaluateRelease(report(),{expectedSha:'b'.repeat(40)}).status,'BLOCKED');const r=report();r.results=r.results.filter(x=>x.name!=='Life OS task orchestration regressions');assert.match(evaluateRelease(r,{expectedSha:sha}).errors.join(' '),/tasks:test/)});
test('failed and synthetic PASS without exit code are blocked',()=>{const r=report();r.results[0].exitCode=null;assert.equal(evaluateRelease(r,{expectedSha:sha}).status,'BLOCKED');r.results[0].exitCode=1;assert.equal(evaluateRelease(r,{expectedSha:sha}).status,'BLOCKED')});

test('malformed provenance blocks release eligibility',()=>{
 const r=report();delete r.startedAt;
 assert.equal(evaluateRelease(r,{expectedSha:sha}).status,'BLOCKED');
 const bad=report();bad.finishedAt='2026-11-06T23:00:00.000Z';
 assert.match(evaluateRelease(bad,{expectedSha:sha}).errors.join(' '),/timestamps/);
});

test('real Node v22 provenance is accepted',()=>{
 const result=evaluateRelease(report(),{expectedSha:sha});
 assert.equal(result.status,'ELIGIBLE_FOR_HUMAN_REVIEW',result.errors.join('; '));
});

test('smoke-only report and negative duration cannot pass full release gate',()=>{
 const smoke={...report(),kind:'LOCAL_SMOKE_ONLY'};
 assert.equal(evaluateRelease(smoke,{expectedSha:sha}).status,'BLOCKED');
 const negative=report();negative.results[0].durationMs=-1;
 assert.equal(evaluateRelease(negative,{expectedSha:sha}).status,'BLOCKED');
});
