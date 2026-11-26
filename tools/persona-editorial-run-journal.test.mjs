import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {claimEditorialRun,readEditorialRun,recordEditorialCall,finishEditorialRun,editorialRunResponse} from './persona-editorial-run-journal.mjs';
const request={mode:'discover',history:['Old topic'],maxCalls:4,consent:true};
const withRoot=async fn=>{const root=await mkdtemp(join(tmpdir(),'persona-editorial-journal-'));try{await fn(root)}finally{await rm(root,{recursive:true,force:true})}};
test('same run identity replays persisted result and rejects changed task',()=>withRoot(async root=>{
 const id=randomUUID();
 assert.equal((await claimEditorialRun(root,id,request)).claimed,true);
 await recordEditorialCall(root,id,1,'research');
 await recordEditorialCall(root,id,2,'independent-review');
 const result={version:1,status:'AUTHOR_REVIEW_REQUIRED',calls:2,maxCalls:4,approved:false,published:false};
 const finished=await finishEditorialRun(root,id,result);
 const duplicate=await claimEditorialRun(root,id,request);
 assert.equal(duplicate.claimed,false);
 assert.deepEqual(editorialRunResponse(duplicate,id),finished);
 await assert.rejects(claimEditorialRun(root,id,{...request,history:['Different']}),/другому заданию/);
 await assert.rejects(finishEditorialRun(root,id,result),/перезаписать/);
}));
test('interrupted call remains ambiguous and cannot be claimed again after restart',()=>withRoot(async root=>{
 const id=randomUUID();
 await claimEditorialRun(root,id,request);
 await recordEditorialCall(root,id,1,'research');
 const state=await readEditorialRun(root,id);
 assert.equal(editorialRunResponse(state,id,true).status,'RUNNING');
 assert.equal(editorialRunResponse(state,id,false).status,'RECONCILIATION_REQUIRED');
 assert.equal(editorialRunResponse(state,id,false).callsPossiblyStarted,1);
 assert.equal((await claimEditorialRun(root,id,request)).claimed,false);
 await assert.rejects(recordEditorialCall(root,id,1,'research'));
}));
test('concurrent duplicate claims, damaged claim and unsafe identity fail closed',()=>withRoot(async root=>{
 const id=randomUUID(),both=await Promise.allSettled([claimEditorialRun(root,id,request),claimEditorialRun(root,id,request)]);
 assert.equal(both.filter(x=>x.status==='fulfilled'&&x.value.claimed).length,1);
 const corrupt=randomUUID();await mkdir(join(root,'editorial-run-'+corrupt));await writeFile(join(root,'editorial-run-'+corrupt,'claim.json'),'invalid');
 await assert.rejects(claimEditorialRun(root,corrupt,request));
 await assert.rejects(readEditorialRun(root,'../../private'));
}));

test('valid JSON with changed claim request is rejected before replay',()=>withRoot(async root=>{
 const id=randomUUID();await claimEditorialRun(root,id,request);
 const file=join(root,'editorial-run-'+id,'claim.json');
 const claim=JSON.parse(await readFile(file,'utf8'));claim.request.history=['Changed'];
 await writeFile(file,JSON.stringify(claim));
 await assert.rejects(readEditorialRun(root,id),/Некорректный журнал/);
}));
test('missing, malformed and out-of-order checkpoints fail closed',()=>withRoot(async root=>{
 const id=randomUUID();await claimEditorialRun(root,id,request);
 await assert.rejects(recordEditorialCall(root,id,1,'revision'));
 await recordEditorialCall(root,id,1,'research');
 const dir=join(root,'editorial-run-'+id);
 await writeFile(join(dir,'call-1-started.json'),JSON.stringify({call:1,stage:'revision',startedAt:new Date().toISOString()}));
 await assert.rejects(readEditorialRun(root,id),/Некорректная контрольная точка/);
 await rm(join(dir,'call-1-started.json'));
 await writeFile(join(dir,'call-2-started.json'),JSON.stringify({call:2,stage:'independent-review',startedAt:new Date().toISOString()}));
 await assert.rejects(readEditorialRun(root,id),/последовательность/);
}));
test('completed result cannot replay with mismatched call evidence',()=>withRoot(async root=>{
 const id=randomUUID();await claimEditorialRun(root,id,request);
 await recordEditorialCall(root,id,1,'research');
 await recordEditorialCall(root,id,2,'independent-review');
 await finishEditorialRun(root,id,{version:1,status:'AUTHOR_REVIEW_REQUIRED',calls:2,maxCalls:4,approved:false,published:false});
 const file=join(root,'editorial-run-'+id,'result.json');
 const result=JSON.parse(await readFile(file,'utf8'));result.calls=1;
 await writeFile(file,JSON.stringify(result));
 await assert.rejects(claimEditorialRun(root,id,request),/Некорректный результат/);
}));
