import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {ProductionJob} from './persona_orchestrator.mjs';

const at='2026-11-22T00:00:00.000Z';
const schedule=(extra={})=>({slotId:'persona:2026-12-01:reel',contentId:'ARCH-001',format:'reel',
 productionAt:at,publicationAt:'2026-12-01T15:00:00.000Z',stages:['local-media'],sources:[],
 budget:{paidCalls:0,maxAttempts:2,maxInputBytes:10000000,maxStageMs:60000},...extra});
async function setup(t){const root=await mkdtemp(join(tmpdir(),'persona-schedule-'));t.after(()=>rm(root,{recursive:true,force:true}));return ProductionJob.create(join(root,'job'));}

test('scheduling attaches canonical calendar IDs without resetting manual lifecycle; paid requests fail closed',async t=>{
 const job=await setup(t);await job.markReady();const before=await job.read();
 await assert.rejects(job.scheduleProduction(schedule({budget:{...schedule().budget,paidCalls:1}})),/budget|paid/i);
 await assert.rejects(job.scheduleProduction(schedule({slotId:'persona:2026-12-01:photo'})),/slot/i);
 await assert.rejects(job.scheduleProduction(schedule({publicationAt:'2026-11-23T00:00:00.000Z'})),/7.*14|buffer/i);
 await job.scheduleProduction(schedule());const state=await job.read();
 assert.equal(state.id,before.id);assert.equal(state.status,before.status);
 assert.equal(state.productionSchedule.contentId,'ARCH-001');assert.equal(state.productionSchedule.publicationApproved,false);
 const revision=state.revision;await job.scheduleProduction(schedule());assert.equal((await job.read()).revision,revision);
 await assert.rejects(job.scheduleProduction(schedule({contentId:'OTHER'})),/overwrite|different/i);
});

test('exclusive stage claims refuse live owners; two attempts persist across reopening',async t=>{
 const job=await setup(t);await job.scheduleProduction(schedule());
 const first=await job.claimProductionStage({owner:'worker-a',now:at});
 assert.equal(first.stage,'local-media');assert.equal(first.attempt,1);
 assert.equal(await new ProductionJob(job.directory).claimProductionStage({owner:'worker-b',now:at}),null);
 await job.settleProductionStage({token:first.token,error:'Temporary local tool failure',now:at});
 const retryAt='2026-11-22T00:01:00.000Z';
 const second=await new ProductionJob(job.directory).claimProductionStage({owner:'worker-b',now:retryAt});
 assert.equal(second.attempt,2);
 await job.settleProductionStage({token:second.token,error:'Temporary local tool failure',now:retryAt});
 assert.equal(await job.claimProductionStage({owner:'worker-c',now:'2026-11-23T00:00:00.000Z'}),null);
 assert.equal((await job.read()).productionSchedule.stages[0].status,'exhausted');
});

test('successful stage receipt is hash-verified and repeated claims cannot duplicate outputs',async t=>{
 const job=await setup(t);await job.scheduleProduction(schedule());
 const claim=await job.claimProductionStage({owner:'worker',now:at});
 const file=join(job.directory,'output','proof.json');await writeFile(file,'{"actual":"local artifact"}');
 const sha256=createHash('sha256').update(await readFile(file)).digest('hex');
 await job.settleProductionStage({token:claim.token,artifacts:[{path:'output/proof.json',sha256}],now:at});
 assert.equal(await job.claimProductionStage({owner:'worker',now:at}),null);
 assert.equal((await job.read()).productionSchedule.stages[0].status,'completed');
 await writeFile(file,'changed');
 await assert.rejects(job.verifyProductionReceipts(),/changed|receipt/i);
});

test('capability blocks preserve work and do not spend retry attempts',async t=>{
 const job=await setup(t);await job.scheduleProduction(schedule({stages:['research','local-media']}));
 const claim=await job.claimProductionStage({owner:'worker',now:at});
 await job.settleProductionStage({token:claim.token,blocked:'RESEARCH_PROVIDER_UNAVAILABLE',now:at});
 const state=await job.read();assert.equal(state.productionSchedule.stages[0].status,'blocked');
 assert.equal(state.productionSchedule.stages[0].attempts,0);
 const next=await job.claimProductionStage({owner:'worker',now:at});assert.equal(next.stage,'local-media');
 assert.equal(state.status,'PREPARING');
});

test('claim from an exited real Worker process recovers once without losing its attempt record',async t=>{
 const job=await setup(t);await job.scheduleProduction(schedule());
 const script=`import {ProductionJob} from ${JSON.stringify(new URL('./persona_orchestrator.mjs',import.meta.url).href)}; const claim=await new ProductionJob(process.argv[1]).claimProductionStage({owner:'exited-worker',now:${JSON.stringify(at)}});console.log(JSON.stringify(claim));`;
 const child=spawnSync(process.execPath,['--input-type=module','-e',script,job.directory],{encoding:'utf8',windowsHide:true});
 assert.equal(child.status,0,child.stderr);assert.equal(JSON.parse(child.stdout).attempt,1);
 const recovered=await new ProductionJob(job.directory).claimProductionStage({owner:'new-worker',now:at});
 assert.equal(recovered.attempt,2);assert.equal((await job.read()).productionSchedule.events.filter(e=>e.event==='dead-owner-recovery').length,1);
});

test('scheduling verifies staged source hashes before persistence and rejects missing original',async t=>{
 const job=await setup(t),before=await job.read();
 await assert.rejects(job.scheduleProduction(schedule({sources:[{name:'missing.mp4',sha256:'a'.repeat(64),bytes:100}]})));
 assert.equal((await job.read()).revision,before.revision);
});

test('proven dead-owned schedule mutex recovers; unknown legacy and live mutexes remain protected',async t=>{
 const job=await setup(t);await job.scheduleProduction(schedule());
 const script=`import {lockProductionSchedule} from ${JSON.stringify(new URL('./persona_orchestrator.mjs',import.meta.url).href)};await lockProductionSchedule(process.argv[1]);`;
 const child=spawnSync(process.execPath,['--input-type=module','-e',script,job.path+'.lock'],{encoding:'utf8',windowsHide:true});assert.equal(child.status,0,child.stderr);
 const claim=await job.claimProductionStage({owner:'restarted-worker',now:at});assert.equal(claim.stage,'local-media');
 const transitionJob=await setup(t);
 const transitionChild=spawnSync(process.execPath,['--input-type=module','-e',script,transitionJob.path+'.lock'],{encoding:'utf8',windowsHide:true});assert.equal(transitionChild.status,0,transitionChild.stderr);
 assert.equal((await transitionJob.markReady()).status,'WAITING_FOR_FOOTAGE');
 await writeFile(job.path+'.lock','legacy lock');
 await assert.rejects(job.claimProductionStage({owner:'next-worker',now:at}),/locked/i);
 await writeFile(job.path+'.lock',JSON.stringify({kind:'persona-production-schedule-lock',pid:process.pid,token:'live-owner'}));
 await assert.rejects(job.claimProductionStage({owner:'next-worker',now:at}),/locked/i);
});
