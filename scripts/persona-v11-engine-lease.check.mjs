import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createEngineIntent,engineLeaseDir,publishEnginePid,readEngineLease,removeEngineLease} from './persona-v11-engine-lease.mjs';

const id='job-'+'a'.repeat(32);

test('durable launch intent precedes PID publication and unresolved launch fails closed',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-v11-lease-')),output=join(root,'run-0');
 try{
  const lease=await createEngineIntent(output,{processingRequestId:id,attempt:0});
  const launching=await readEngineLease(output,id);assert.equal(launching.state,'launching');
  await assert.rejects(createEngineIntent(output,{processingRequestId:id,attempt:0}),/EEXIST/);
  await publishEnginePid(lease,12345);
  const running=await readEngineLease(output,id);assert.equal(running.state,'running');assert.equal(running.pid,12345);
  await removeEngineLease(lease);assert.equal(await readEngineLease(output,id),null);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('partial temp publication cannot replace the valid intent and invalid final data fails closed',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-v11-lease-')),output=join(root,'run-0');
 try{
  const lease=await createEngineIntent(output,{processingRequestId:id,attempt:2});
  await writeFile(join(engineLeaseDir(output),'running.json.partial.tmp'),'{');
  assert.equal((await readEngineLease(output,id)).state,'launching');
  assert.equal(JSON.parse(await readFile(join(engineLeaseDir(output),'intent.json'),'utf8')).attempt,2);
  await writeFile(join(engineLeaseDir(output),'running.json'),'{');
  await assert.rejects(readEngineLease(output,id),/v11_engine_lease_invalid/);
  await removeEngineLease(lease);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('pre-intent crash is distinguishable and safe to clean before any engine could spawn',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-v11-lease-')),output=join(root,'run-0');
 try{
  const dir=engineLeaseDir(output);await mkdir(dir);
  await writeFile(join(dir,'intent.json.partial.tmp'),'{');
  assert.equal((await readEngineLease(output,id)).state,'prelaunch');
 }finally{await rm(root,{recursive:true,force:true});}
});
