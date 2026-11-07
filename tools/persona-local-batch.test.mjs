import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runBatch} from './persona-local-batch.mjs';
const task=(id,status,dependsOn=[],file='tools/persona-evidence.test.mjs')=>({id,status,dependsOn,priority:'P0',kind:'engineering',title:id,acceptance:'Local test PASS',execution:{type:'node-test',file}});
test('batch runs two real dependent tests and journals each',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-batch-'));
 try{
  const input=join(dir,'board.json');
  await writeFile(input,JSON.stringify({schemaVersion:1,revision:0,tasks:[task('A','READY'),task('B','QUEUED',['A'])]}));
  const result=await runBatch({input,output:join(dir,'out'),maxTasks:2});
  assert.equal(result.status,'COMPLETED_WITHIN_LIMIT',JSON.stringify(result));
  assert.deepEqual(result.results.map(x=>x.id),['A','B']);
  const board=JSON.parse(await readFile(input,'utf8'));
  assert.deepEqual(board.tasks.map(x=>x.status),['DONE','DONE']);
  assert.equal(board.revision,5);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('batch refuses unsupported runnable tasks before modifying board',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-batch-deny-'));
 try{
  const input=join(dir,'board.json');
  await writeFile(input,JSON.stringify({schemaVersion:1,revision:0,tasks:[task('A','READY',[],'/tmp/untrusted.sh')]}));
  await assert.rejects(runBatch({input,output:join(dir,'out')}),/allowlisted/);
  assert.equal(JSON.parse(await readFile(input,'utf8')).revision,0);
 }finally{await rm(dir,{recursive:true,force:true})}
});
