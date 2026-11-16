import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {ProductionJob} from './persona_orchestrator.mjs';

test('P3 coverage does not advance without reviewed footage',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-p3-job-'));
 try {
  const job=await ProductionJob.create(join(root,'job'));
  await job.markReady();
  await job.transition('ANALYZING',{asset:{name:'take.mp4',sha256:'a'.repeat(64),bytes:2048,durationSec:3}});
  const brief=join(root,'brief.json'),bindings=join(root,'bindings.json');
  const content=JSON.stringify({version:1,shots:[{order:1,action:'Actor reaction',durationSec:2}],script:[{order:1,line:'',durationSec:2}]});
  await writeFile(brief,content);await writeFile(bindings,JSON.stringify({version:1,bindings:[]}));
  const result=await job.inspectCoverage({brief,bindings,approvalSha256:createHash('sha256').update(content).digest('hex')});
  assert.equal(result.status,'REVIEW_REQUIRED');
  assert.equal(result.summary.MISSING,1);
  assert.equal((await job.read()).status,'ANALYZING');
 }finally{await rm(root,{recursive:true,force:true})}
});
test('P3 style gate blocks unverified inventory and economics never invents savings',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-p3-style-'));
 try {
  const job=await ProductionJob.create(join(root,'job'));
  await job.markReady();
  await job.transition('ANALYZING',{asset:{name:'take.mp4',sha256:'a'.repeat(64),bytes:2048,durationSec:3}});
  await job.transition('EDITING',{reason:'test setup, no claimed author approval'});
  const plan=join(root,'intent.json');
  await writeFile(plan,JSON.stringify({styleId:'independent-artist-quiet-luxury'}));
  const gate=await job.checkStyle({plan});
  assert.equal(gate.status,'BLOCKED');
  await job.economics({command:'create',args:['test-job']});
  const report=await job.economics({command:'report',args:['test-job']});
  assert.equal(report.minutesSaved,null);
  assert.equal((await job.read()).status,'EDITING');
 }finally{await rm(root,{recursive:true,force:true})}
});
