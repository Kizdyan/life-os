import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProductionJob} from './persona_orchestrator.mjs';
import {seedTenProductionJobs} from './seed_10_projects.mjs';
import {parseArchitectTimedShots,validateArchitectIdeas} from '../packages/core/src/persona-architect-shot-parser.mjs';

const source=JSON.parse(await readFile(new URL('../packages/core/src/persona-architect-ten-reels.json',import.meta.url),'utf8'));

test('Architect inputs are exactly 10 distinct, gap-free timed shot lists without edited source text',()=>{
 const data=validateArchitectIdeas(source);
 assert.equal(data.length,10);
 for(const {item,scenes} of data){
  assert.equal(scenes.length,5,item.id);
  assert.equal(scenes[0].startSec,0,item.id);
  assert.ok(scenes.at(-1).endSec>=18&&scenes.at(-1).endSec<=30,item.id);
  assert.deepEqual(parseArchitectTimedShots(item.mainShots),scenes);
 }
 assert.equal(source[3].music,'Три коротких блога по 8-12 сек. Общий мотив, но разная гармония и темп.');
});
test('seed_10_projects executes 10 real ProductionJob transitions to WAITING_FOR_FOOTAGE',async t=>{
 const root=await mkdtemp(join(tmpdir(),'persona-architect-10-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const result=await seedTenProductionJobs(root);
 assert.equal(result.created,10);
 assert.equal(result.count,10);
 assert.equal(result.allWaitingForFootage,true);
 for(const [i,entry] of result.jobs.entries()){
  const state=await new ProductionJob(entry.directory).read();
  assert.equal(state.title,source[i].title);
  assert.equal(state.status,'WAITING_FOR_FOOTAGE');
  assert.equal(state.revision,1);
  assert.equal(state.history.length,1);
  assert.equal(state.history[0].from,'PREPARING');
  assert.equal(state.history[0].to,'WAITING_FOR_FOOTAGE');
  assert.deepEqual(state.assets,[]);
  const fixture=JSON.parse(await readFile(join(entry.directory,'input','architect-source.json'),'utf8'));
  const shots=JSON.parse(await readFile(join(entry.directory,'output','architect-shot-list.json'),'utf8'));
  const manifest=JSON.parse(await readFile(join(entry.directory,'output','architect-manifest.json'),'utf8'));
  assert.deepEqual(fixture,source[i],'The original author text must be lossless');
  assert.equal(shots.shots.length,5);
  assert.equal(shots.brollIdeas,source[i].broll);
  assert.equal(shots.musicalDirection,source[i].music);
  assert.equal(manifest.editorialApproved,false);
  assert.equal(manifest.footageAvailable,false);
 }
 const instructions=JSON.parse(await readFile(result.browserManifest,'utf8'));
 assert.equal(instructions.storageKey,'lifeos:persona:projects:v1');
 assert.equal(instructions.hash,'#persona/seed10');
 const second=await seedTenProductionJobs(root);
 assert.equal(second.created,0);
 assert.equal(second.existing,10);
 assert.deepEqual(second.jobs.map(j=>j.jobId),result.jobs.map(j=>j.jobId));
});
test('refuse to overwrite an unrelated job with a colliding source ID',async t=>{
 const root=await mkdtemp(join(tmpdir(),'persona-architect-collision-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const job=await ProductionJob.create(join(root,'reel-01'),{title:'Unrelated production'});
 const before=await job.read();
 await assert.rejects(seedTenProductionJobs(root),/Existing project differs/);
 assert.deepEqual(await job.read(),before);
});
