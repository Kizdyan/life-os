import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {dispatch,run} from './persona-task-dispatcher.mjs';
import {transition,updateBoard,recovery} from './persona-task-journal.mjs';
const t=(id,status='QUEUED',dependsOn=[],priority='P1')=>({id,status,dependsOn,priority,kind:'engineering',title:id,acceptance:'Verified result'});
const board=()=>({schemaVersion:1,revision:0,tasks:[t('A','READY',[],'P0'),t('B','QUEUED',['A'])]});
test('priority and dependencies',()=>{const r=dispatch(board());assert.deepEqual(r.selected.map(x=>x.id),['A']);assert.deepEqual(r.waiting.map(x=>x.id),['B']);assert.equal(r.actionsExecuted,0)});
test('cycles and duplicates rejected',()=>{assert.throws(()=>dispatch({schemaVersion:1,tasks:[t('A','QUEUED',['B']),t('B','QUEUED',['A'])]}),/cycle/);assert.throws(()=>dispatch({schemaVersion:1,tasks:[t('A'),t('A')]}),/Duplicate/)});
test('DONE requires evidence and revision',()=>{const a=transition(board(),{id:'A',to:'RUNNING',expectedRevision:0});assert.throws(()=>transition(a.board,{id:'A',to:'DONE'}),/evidence/);const b=transition(a.board,{id:'A',to:'DONE',evidence:'All tests passed'});assert.equal(b.board.revision,2);assert.throws(()=>transition(b.board,{id:'A',to:'READY'}),/Illegal/)});
test('blocked dependency cannot start',()=>{const a=transition(board(),{id:'B',to:'READY'});assert.throws(()=>transition(a.board,{id:'B',to:'RUNNING'}),/Dependencies/)});
test('recovery never retries automatically',()=>{const r=recovery({schemaVersion:1,tasks:[t('A','RUNNING'),t('B','FAILED')]});assert.equal(r.running.length,1);assert.equal(r.actionsExecuted,0)});
test('persistent journal and dispatcher',async()=>{const dir=await mkdtemp(join(tmpdir(),'lifeos-'));try{const file=join(dir,'board.json');await writeFile(file,JSON.stringify(board()));await updateBoard({input:file,id:'A',to:'RUNNING',expectedRevision:0});await assert.rejects(updateBoard({input:file,id:'A',to:'DONE',evidence:'All tests passed',expectedRevision:0}),/Revision/);await updateBoard({input:file,id:'A',to:'DONE',evidence:'All tests passed',expectedRevision:1});const data=JSON.parse(await readFile(file,'utf8'));assert.equal(data.history.length,2);const result=await run({input:file,output:join(dir,'out')});assert.equal(result.selected[0].id,'B')}finally{await rm(dir,{recursive:true,force:true})}});

test('capacity saturation is reported rather than silently dropping ready tasks',()=>{const b={schemaVersion:1,tasks:[t('A','READY'),t('B','READY'),t('C','RUNNING')]};const result=dispatch(b,{maxConcurrent:1});assert.equal(result.selected.length,0);assert.equal(result.waiting.length,2);assert.ok(result.waiting.every(x=>x.reason==='CAPACITY'))});
test('missing dependency fails closed',()=>{assert.throws(()=>dispatch({schemaVersion:1,tasks:[t('A','QUEUED',['MISSING'])]}),/Unknown dependency/)});

test('reject malformed effort, non-string dependencies, and zero concurrency',()=>{
 assert.throws(()=>dispatch({schemaVersion:1,tasks:[{...t('A'),estimatedMinutes:-5}]}),/Invalid task/);
 assert.throws(()=>dispatch({schemaVersion:1,tasks:[{...t('A'),dependsOn:[null]}]}),/Invalid task/);
 assert.throws(()=>dispatch(board(),{maxConcurrent:0}),/Invalid concurrency/);
});
test('missing required acceptance evidence is invalid',()=>{
 assert.throws(()=>dispatch({schemaVersion:1,tasks:[{...t('A'),acceptance:''}]}),/Invalid task/);
});

test('journal rejects invalid evidence types and malformed history',()=>{
 const a=transition(board(),{id:'A',to:'RUNNING',expectedRevision:0});
 assert.throws(()=>transition(a.board,{id:'A',to:'DONE',evidence:123456789012}),/evidence/);
 assert.throws(()=>transition(a.board,{id:'A',to:'DONE',evidence:'All tests passed',note:null}),/Invalid or oversized evidence/);
 assert.throws(()=>transition({...a.board,history:{}},{id:'A',to:'DONE',evidence:'All tests passed'}),/Invalid history/);
});
