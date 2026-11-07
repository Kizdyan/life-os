import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {executeLocalTest,validateExecution} from './persona-local-executor.mjs';
const task=(id,file,status='READY')=>({id,status,dependsOn:[],priority:'P0',kind:'engineering',title:id,acceptance:'Node test PASS',execution:{type:'node-test',file}});
test('executor refuses arbitrary shell and unapproved scripts',()=>{
 assert.throws(()=>validateExecution(task('X','../../etc/passwd')),/allowlisted/);
 assert.throws(()=>validateExecution({...task('X','tools/persona-evidence.test.mjs'),execution:{type:'shell',file:'tools/persona-evidence.test.mjs'}}),/allowlisted/);
});
test('local executor runs real test, records evidence and DONE',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-executor-'));
 try{
  const input=join(dir,'board.json'),output=join(dir,'run');
  await writeFile(input,JSON.stringify({schemaVersion:1,revision:0,tasks:[task('EVIDENCE','tools/persona-evidence.test.mjs')]}));
  const result=await executeLocalTest({input,id:'EVIDENCE',output,expectedRevision:0});
  assert.equal(result.status,'PASS',result.stderr);
  const board=JSON.parse(await readFile(input,'utf8'));
  assert.equal(board.tasks[0].status,'DONE');
  assert.equal(board.revision,2);
  assert.equal(board.history.at(-1).evidenceVerification.kind,'LOCAL_FILE_HASH');
  assert.equal(JSON.parse(await readFile(join(output,'execution.json'),'utf8')).status,'PASS');
  await assert.rejects(executeLocalTest({input,id:'EVIDENCE',output:join(dir,'again'),expectedRevision:2}),/READY/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('executor refuses stale revisions and blocked tasks without side effects',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-executor-reject-'));
 try{
  const input=join(dir,'board.json');
  await writeFile(input,JSON.stringify({schemaVersion:1,revision:0,tasks:[task('X','tools/persona-evidence.test.mjs','BLOCKED')]}));
  await assert.rejects(executeLocalTest({input,id:'X',output:join(dir,'out'),expectedRevision:0}),/READY/);
  await assert.rejects(executeLocalTest({input,id:'X',output:join(dir,'out2'),expectedRevision:1}),/Revision/);
  assert.equal(JSON.parse(await readFile(input,'utf8')).revision,0);
 }finally{await rm(dir,{recursive:true,force:true})}
});
