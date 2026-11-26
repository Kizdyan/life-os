import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {rankPhotos} from './persona-yandex-start.mjs';
import {FOLDERS} from './persona-yandex-library.mjs';
const scores={portrait:9,screen:8,stage:7,music:6,editorial:9};
async function fixture(){
 const cache=await mkdtemp(join(tmpdir(),'persona-photo-review-'));
 const sources=join(cache,'sources',FOLDERS[0]),dir=join(cache,'catalogs',FOLDERS[0]),thumbs=join(dir,'thumbnails');
 await mkdir(sources,{recursive:true});await mkdir(thumbs,{recursive:true});
 const assets=[];
 for(let i=1;i<=3;i++){
  const sourcePath=join(sources,'p'+i+'.jpg'),thumbnail='t'+i+'.jpg';
  await writeFile(sourcePath,'original '+i);await writeFile(join(thumbs,thumbnail),String(i));
  assets.push({kind:'image',availability:'local',sourcePath,sha256:String(i).repeat(64),frames:[{thumbnail}]});
 }
 await writeFile(join(dir,'persona-assets-v1.json'),JSON.stringify({assets}));
 return {cache,assets,out:join(cache,'about-me')};
}
test('per-item checkpoints, distinct errors, reuse without rescoring and immutable originals',async()=>{
 const {cache,assets,out}=await fixture();
 try{
  let calls=0;
  const first=await rankPhotos({cache,model:'vision',log:()=>{},assess:async bytes=>{calls++;if(bytes.toString()==='2')throw Error('fixture error');return {scores,reason:'ok'}}});
  assert.equal(first.status,'PARTIAL');assert.equal(calls,3);assert.equal(first.imagesScored,2);
  const p=JSON.parse(await readFile(join(out,'photo-progress.json'),'utf8'));
  assert.deepEqual([p.processed,p.succeeded,p.failed,p.state],[3,2,1,'PARTIAL']);
  const second=await rankPhotos({cache,model:'vision',log:()=>{},assess:async bytes=>{calls++;assert.equal(bytes.toString(),'2');return {scores,reason:'ok'}}});
  assert.equal(second.status,'PASS');assert.equal(calls,4);assert.equal(second.imagesScored,3);
  const q=JSON.parse(await readFile(join(out,'photo-progress.json'),'utf8'));
  assert.equal(q.reused,2);assert.equal(q.failed,0);
  assert.notEqual(first.shortlist,second.shortlist);
  assert.equal((await readFile(assets[0].sourcePath,'utf8')),'original 1');
  assert.ok(!(await readdir(out)).includes('photo-review.lock'));
 }finally{await rm(cache,{recursive:true,force:true})}
});
test('refuses concurrent or corrupted checkpoint, preserves data',async()=>{
 const {cache,out}=await fixture();
 try{
  await mkdir(out,{recursive:true});const lock=join(out,'photo-review.lock');
  await writeFile(lock,'existing process');
  await assert.rejects(rankPhotos({cache,model:'vision'}),/EEXIST/);
  assert.equal(await readFile(lock,'utf8'),'existing process');
  await rm(lock);const state=join(out,'photo-scores.json');await writeFile(state,'not json');
  await assert.rejects(rankPhotos({cache,model:'vision'}),/checkpoint unreadable/);
  assert.equal(await readFile(state,'utf8'),'not json');
 }finally{await rm(cache,{recursive:true,force:true})}
});
