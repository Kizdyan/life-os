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


test('ProductionJob binds intercut suggestions to the exact timeline and requires author review',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-intercut-job-'));
 try{
  const job=await ProductionJob.create(join(root,'job'));
  await job.markReady();
  await job.transition('ANALYZING',{asset:{name:'take.mp4',sha256:'a'.repeat(64),bytes:2048,durationSec:5}});
  await job.transition('EDITING',{reason:'test setup'});
  const timelinePath=join(root,'timeline.json');
  const timeline={version:1,clips:[
   {path:'take.mp4',startSec:0,durationSec:2},
   {path:'take.mp4',startSec:3,durationSec:2}
  ]};
  await writeFile(timelinePath,JSON.stringify(timeline));
  const proposed=await job.prepareIntercuts({timelinePath});
  assert.equal(proposed.status,'AWAITING_INTERCUT_REVIEW');
  assert.equal(proposed.suggestions[0].status,'ZOOM_FALLBACK_CANDIDATE');
  const reviewed=await job.applyIntercutZoom({timelinePath,intercutPath:proposed.path,reviewedAfterClips:[1]});
  assert.equal(reviewed.status,'REVIEWED_EDIT_PLAN_READY');
  const actual=JSON.parse(await (await import('node:fs/promises')).readFile(reviewed.path,'utf8'));
  assert.equal(actual.clips[0].intercutFallback.kind,'slow_push_in');
  assert.equal(actual.publicationApproved,false);
  await writeFile(timelinePath,JSON.stringify({...timeline,version:2}));
  await assert.rejects(job.applyIntercutZoom({timelinePath,intercutPath:proposed.path,reviewedAfterClips:[1]}),/Stale intercut plan/);
 }finally{await rm(root,{recursive:true,force:true})}
});
