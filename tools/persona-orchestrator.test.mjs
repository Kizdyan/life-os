import assert from 'node:assert/strict';
import {mkdtemp, readdir, rm, unlink, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {test} from 'node:test';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {ProductionJob} from './persona_orchestrator.mjs';

test('batch validates the requested count and requires one verified master',async t=>{
  const root=await mkdtemp(join(tmpdir(),'persona-batch-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const job=await ProductionJob.create(join(root,'job'));
  await assert.rejects(job.runBatch({count:2}),/3, 4 or 5/);
  await assert.rejects(job.runBatch(),/one verified source/);
  assert.equal((await job.read()).status,'PREPARING');
  assert.deepEqual(await readdir(join(job.directory,'output')),[]);
});

test('batch lock excludes manual advances and concurrent batch jobs',async t=>{
  const root=await mkdtemp(join(tmpdir(),'persona-batch-lock-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const job=await ProductionJob.create(join(root,'job'));
  await writeFile(job.path+'.batch.lock','another batch');
  await assert.rejects(job.markReady(),/reserved this job/);
  await assert.rejects(job.runBatch(),/already running/);
  await unlink(job.path+'.batch.lock');
  assert.equal((await job.markReady()).status,'WAITING_FOR_FOOTAGE');
});

test('worker attempts persist, preserve verified inputs, and reject stale completion',async t=>{
  const root=await mkdtemp(join(tmpdir(),'persona-job-attempt-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const original=await ProductionJob.create(join(root,'job'),{workflow:'music-studio',context:{format:'OneEmotion'}});
  const digest='a'.repeat(64);
  await original.markReady();
  await original.transition('ANALYZING',{asset:{name:'master.mp4',bytes:2048,durationSec:12,sha256:digest}});
  const first=await original.beginAttempt({folder:'render-first',requestSha256:digest});
  const reopened=new ProductionJob(original.directory);
  assert.deepEqual((await reopened.read()).attempt,first.attempt);
  await assert.rejects(reopened.beginAttempt({folder:'render-duplicate',requestSha256:digest}),/already running/);
  await reopened.failAttempt(first.attempt.folder);
  const retry=await reopened.beginAttempt({folder:'render-retry',requestSha256:digest});
  await assert.rejects(reopened.completeAttempt(first.attempt.folder,digest),/current attempt/);
  await reopened.completeAttempt(retry.attempt.folder,digest);
  const state=await reopened.read();
  assert.equal(state.status,'AWAITING_APPROVAL');
  assert.equal(state.attempt.resultSha256,digest);
  assert.equal(state.assets[0].sha256,digest);
  assert.equal(state.publicationApproved,false);
  assert.equal(state.distributionAllowed,false);
});

test('a killed worker can resume verified inputs in a fresh attempt directory',async t=>{
  const root=await mkdtemp(join(tmpdir(),'persona-worker-kill-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const job=await ProductionJob.create(join(root,'job'),{workflow:'music-studio'});
  const digest='b'.repeat(64);
  await job.markReady();
  await job.transition('ANALYZING',{asset:{name:'master.mov',durationSec:12,sha256:digest}});
  const module=new URL('./persona_orchestrator.mjs',import.meta.url).href;
  const program=`import {ProductionJob} from ${JSON.stringify(module)};
    await new ProductionJob(process.argv[1]).beginAttempt({folder:'render-first',requestSha256:${JSON.stringify(digest)}});
    process.stdout.write('ready'); setInterval(()=>{},1000);`;
  const child=spawn(process.execPath,['--input-type=module','-e',program,job.directory],{stdio:['ignore','pipe','pipe']});
  const exited=once(child,'close');
  t.after(()=>child.kill());
  const outcome=await Promise.race([once(child.stdout,'data'),exited]);
  assert.equal(String(outcome[0]),'ready');
  child.kill();
  await exited;
  const reopened=new ProductionJob(job.directory);
  const retry=await reopened.beginAttempt({folder:'render-next',requestSha256:digest});
  assert.equal(retry.attempt.folder,'render-next');
  assert.equal(retry.assets[0].sha256,digest);
  assert.equal(retry.history.filter(event=>event.to==='EDITING').length,2);
});
