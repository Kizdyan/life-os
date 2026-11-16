import assert from 'node:assert/strict';
import {mkdtemp, readdir, rm, unlink, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {test} from 'node:test';
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

test('render failures persist as terminal FAILED in job.json and survive a restart',async t=>{
 const root=await mkdtemp(join(tmpdir(),'persona-canonical-failed-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const job=await ProductionJob.create(join(root,'job'));
 await job.markReady();
 const failed=await job.markFailed('FFmpeg завершился с ошибкой');
 assert.equal(failed.status,'FAILED');
 assert.match(failed.failure.message,/FFmpeg/);
 assert.equal(failed.history.at(-1).to,'FAILED');
 const restored=await new ProductionJob(job.directory).read();
 assert.equal(restored.status,'FAILED');
 assert.equal(restored.revision,2);
 await assert.rejects(job.transition('ANALYZING'),/Illegal transition/);
 await assert.rejects(job.markFailed('another failure'),/Illegal transition/);
});
