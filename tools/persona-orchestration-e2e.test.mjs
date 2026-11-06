import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..');
const run=(file,args)=>spawnSync(process.execPath,[join(root,'tools',file),...args],{cwd:root,encoding:'utf8',timeout:15000});
const task=(id,status,dependsOn=[])=>({id,status,dependsOn,priority:'P0',kind:'engineering',title:id,acceptance:'Verification evidence'});
test('real CLI flow: dispatch -> transition -> evidence -> next dispatch',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'lifeos-e2e-'));
 try{
  const board=join(dir,'board.json');
  await writeFile(board,JSON.stringify({schemaVersion:1,revision:0,tasks:[task('CI','READY'),task('MEDIA','QUEUED',['CI'])]}));
  let result=run('persona-task-dispatcher.mjs',['--input',board,'--output',join(dir,'dispatch-1')]);
  assert.equal(result.status,0,result.stderr);
  let plan=JSON.parse(await readFile(join(dir,'dispatch-1','dispatch.json'),'utf8'));
  assert.deepEqual(plan.selected.map(x=>x.id),['CI']);
  result=run('persona-task-journal.mjs',['--input',board,'--id','CI','--to','RUNNING','--revision','0']);
  assert.equal(result.status,0,result.stderr);
  result=run('persona-task-journal.mjs',['--input',board,'--id','CI','--to','DONE','--revision','1']);
  assert.notEqual(result.status,0,'DONE without evidence must fail');
  result=run('persona-task-journal.mjs',['--input',board,'--id','CI','--to','DONE','--revision','1','--evidence','Independent tests verified']);
  assert.equal(result.status,0,result.stderr);
  result=run('persona-task-dispatcher.mjs',['--input',board,'--output',join(dir,'dispatch-2')]);
  assert.equal(result.status,0,result.stderr);
  plan=JSON.parse(await readFile(join(dir,'dispatch-2','dispatch.json'),'utf8'));
  assert.deepEqual(plan.selected.map(x=>x.id),['MEDIA']);
  const state=JSON.parse(await readFile(board,'utf8'));
  assert.equal(state.revision,2);assert.equal(state.history.length,2);
  result=run('persona-task-dispatcher.mjs',['--input',board,'--output',join(dir,'dispatch-2')]);
  assert.notEqual(result.status,0,'Existing report must not be overwritten');
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('release gate CLI blocks dry-run and stale commit',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'lifeos-release-gate-'));
 try{
  const sha='a'.repeat(40),input=join(dir,'report.json');
  await writeFile(input,JSON.stringify({commit:sha,dryRun:true,overall:'PASS',results:[]}));
  const result=run('persona-release-gate.mjs',['--input',input,'--sha',sha,'--output',join(dir,'gate')]);
  assert.equal(result.status,1);
  const report=JSON.parse(await readFile(join(dir,'gate','release-gate.json'),'utf8'));
  assert.equal(report.status,'BLOCKED');assert.equal(report.mergeApproved,false);
 }finally{await rm(dir,{recursive:true,force:true})}
});
