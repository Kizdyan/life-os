import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inspectPersonaRuntime} from './persona-runtime-status.mjs';
import {FOLDERS} from './persona-yandex-library.mjs';
test('runtime distinguishes configured library, actual scores, legacy report and unindexed references',async()=>{
 const cache=await mkdtemp(join(tmpdir(),'persona-runtime-'));
 try{
  const unconfigured=await inspectPersonaRuntime();assert.equal(unconfigured.cache,'NOT_CONFIGURED');
  await mkdir(join(cache,'about-me'));
  for(const f of FOLDERS){
   const dir=join(cache,'catalogs',f);await mkdir(dir,{recursive:true});
   await writeFile(join(dir,'persona-assets-v1.json'),JSON.stringify({kind:'persona-local-library-v1',assets:[{availability:'local',sourcePath:'private-example.jpg'}]}));
  }
  const score=JSON.stringify({model:'vision',rows:[{sha256:'a'.repeat(64),scores:{portrait:8,screen:2,stage:1,music:0,editorial:5},reason:'private reason'}]});
  const path=join(cache,'about-me','photo-scores.json');await writeFile(path,score);
  await writeFile(join(cache,'START-RESULT.json'),JSON.stringify({photoStatus:'PARTIAL',photoCount:261,shortlistCount:6}));
  const result=await inspectPersonaRuntime({cache});
  assert.equal(result.photos.scored,1);assert.equal(result.photos.legacyReportedCount,261);assert.equal(result.photos.selected,6);
  assert.equal(result.frameIndex.status,'MISSING');assert.equal(result.personal.total,1);
  assert.equal(result.publicationApproved,false);assert.ok(!JSON.stringify(result).includes('private'));
  assert.equal(await readFile(path,'utf8'),score);
  const now=Date.now();await writeFile(join(cache,'about-me','photo-progress.json'),JSON.stringify({state:'running',heartbeatAt:new Date(now-100000).toISOString()}));
  assert.equal((await inspectPersonaRuntime({cache,now})).photos.status,'STALE_HEARTBEAT');
  await writeFile(path,'{}');await rm(join(cache,'about-me','photo-progress.json'));
  assert.equal((await inspectPersonaRuntime({cache})).photos.status,'UNSUPPORTED_CHECKPOINT');
 }finally{await rm(cache,{recursive:true,force:true})}
});
