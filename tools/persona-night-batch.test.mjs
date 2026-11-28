import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as batch from './persona-local-batch.mjs';
const task=(id,status='READY',execution={type:'node-test',file:'tools/persona-evidence.test.mjs'})=>({id,status,dependsOn:[],priority:'P0',kind:'engineering',title:id,acceptance:'Actual local evidence, no creative approval',...(execution?{execution}:{})});
const good={availableRamBytes:8*1024**3,systemDiskFreeBytes:3*1024**3,workingDiskFreeBytes:30*1024**3,loadedHeavyModels:0};
test('night resource guard refuses full system disk and concurrent heavy models',()=>{
 assert.equal(typeof batch.nightResourceGuard,'function');
 assert.equal(batch.nightResourceGuard(good).status,'PASS');
 assert.ok(batch.nightResourceGuard({...good,systemDiskFreeBytes:300*1024**2}).reasons.includes('SYSTEM_DISK_LOW'));
 assert.ok(batch.nightResourceGuard({...good,loadedHeavyModels:2}).reasons.includes('MULTIPLE_HEAVY_MODELS'));
 assert.equal(batch.nightResourceGuard({...good,availableRamBytes:NaN}).status,'BLOCKED');
});
test('interrupted task is retained for inspection, not silently repeated',async()=>{
 assert.equal(typeof batch.recoverNightTasks,'function');
 const dir=await mkdtemp(join(tmpdir(),'night-recovery-')),input=join(dir,'board.json');
 await writeFile(input,JSON.stringify({schemaVersion:1,revision:0,tasks:[task('RUN','RUNNING'),task('SAFE')]}));
 await batch.recoverNightTasks({input});
 const board=JSON.parse(await readFile(input,'utf8'));
 assert.equal(board.tasks[0].status,'BLOCKED');assert.equal(board.tasks[1].status,'READY');assert.equal(board.history[0].to,'BLOCKED');
});
test('night adapter uses existing board, continues past missing capability and never reruns DONE',async()=>{
 assert.equal(typeof batch.runNightBatch,'function');
 const dir=await mkdtemp(join(tmpdir(),'night-real-')),input=join(dir,'board.json');
 await writeFile(input,JSON.stringify({schemaVersion:1,revision:0,tasks:[task('A','READY',null),task('B')]}));
 const result=await batch.runNightBatch({input,output:join(dir,'night'),maxTasks:3,resourceProbe:async()=>good});
 assert.equal(result.status,'FINISHED');
 const board=JSON.parse(await readFile(input,'utf8'));assert.deepEqual(board.tasks.map(t=>t.status),['BLOCKED','DONE']);
 const again=await batch.runNightBatch({input,output:join(dir,'night'),maxTasks:3,resourceProbe:async()=>good});
 assert.equal(again.executed,0);assert.equal(again.publicationApproved,false);
});
test('unsafe resources stop before changing the board',async()=>{
 assert.equal(typeof batch.runNightBatch,'function');
 const dir=await mkdtemp(join(tmpdir(),'night-resource-')),input=join(dir,'board.json');
 const raw=JSON.stringify({schemaVersion:1,revision:0,tasks:[task('A')]});await writeFile(input,raw);
 const r=await batch.runNightBatch({input,output:join(dir,'out'),resourceProbe:async()=>({...good,availableRamBytes:1})});
 assert.equal(r.status,'RESOURCE_BLOCKED');assert.equal(await readFile(input,'utf8'),raw);
});
test('safe stop marker finishes without touching a ready task',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'night-stop-')),input=join(dir,'board.json'),output=join(dir,'night');
 const {mkdir}=await import('node:fs/promises');await mkdir(output);
 await writeFile(input,JSON.stringify({schemaVersion:1,revision:0,tasks:[task('A')]}));
 await writeFile(join(output,'STOP'),JSON.stringify({kind:'persona-night-stop-v1',requested:true}));
 const r=await batch.runNightBatch({input,output,resourceProbe:async()=>good});assert.equal(r.status,'STOPPED');assert.equal(r.executed,0);
 assert.equal(JSON.parse(await readFile(input,'utf8')).revision,0);
});
