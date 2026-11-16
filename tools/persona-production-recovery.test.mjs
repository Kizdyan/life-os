import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProductionJob} from './persona_orchestrator.mjs';

test('ProductionJob restores status, revision and history after worker process restart', async t => {
 const root=await mkdtemp(join(tmpdir(),'persona-recovery-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const directory=join(root,'job');
 const before=await ProductionJob.create(directory,{title:'Recovery test'});
 const waiting=await before.markReady();
 assert.equal(waiting.status,'WAITING_FOR_FOOTAGE');
 const reopened=new ProductionJob(directory);
 const state=await reopened.read();
 assert.equal(state.id,waiting.id);
 assert.equal(state.title,'Recovery test');
 assert.equal(state.revision,1);
 assert.equal(state.history.length,1);
 assert.equal(state.history[0].to,'WAITING_FOR_FOOTAGE');
 assert.equal(state.status,'WAITING_FOR_FOOTAGE');
 await assert.rejects(reopened.markReady(),/Illegal transition/);
 assert.equal((await new ProductionJob(directory).read()).revision,1);
});

test('ProductionJob refuses corrupted persisted status without silently resetting user work', async t => {
 const root=await mkdtemp(join(tmpdir(),'persona-recovery-corrupt-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const directory=join(root,'job');
 const job=await ProductionJob.create(directory);
 const original=JSON.parse(await readFile(job.path,'utf8'));
 await writeFile(job.path,JSON.stringify({...original,status:'APPROVED_AND_PUBLISHED'}));
 await assert.rejects(new ProductionJob(directory).read(),/Corrupt job state/);
 const persisted=JSON.parse(await readFile(job.path,'utf8'));
 assert.equal(persisted.status,'APPROVED_AND_PUBLISHED');
});

test('ProductionJob reopens with immutable asset metadata and remains write-locked against stale jobs', async t => {
 const root=await mkdtemp(join(tmpdir(),'persona-recovery-lock-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const directory=join(root,'job');
 const original=await ProductionJob.create(directory);
 await original.markReady();
 const reopened=new ProductionJob(directory);
 const before=await reopened.read();
 assert.deepEqual(before.assets,[]);
 await writeFile(original.path+'.lock','worker stalled');
 await assert.rejects(reopened.transition('ANALYZING'),/Job locked/);
 assert.deepEqual(await reopened.read(),before);
});
