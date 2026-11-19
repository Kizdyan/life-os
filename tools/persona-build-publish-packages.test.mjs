#!/usr/bin/env node
/** Verify the five ZIPs produced by the browser-using build script. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const dir=resolve(process.env.PERSONA_PUBLISH_OUTPUT_DIR||'artifacts/persona-publish-self-test');
const ids=[
 'carousel-baseline-pause','carousel-why-director-leaves-question',
 'carousel-photo-archive','carousel-mixed-narrative'
];
function unzip(buffer){
 const files=[];let at=0;
 while(at+30<=buffer.length&&buffer.readUInt32LE(at)===0x04034b50){
  const nameLength=buffer.readUInt16LE(at+26),extraLength=buffer.readUInt16LE(at+28),
   size=buffer.readUInt32LE(at+18),start=at+30+nameLength+extraLength;
  assert.ok(start+size<=buffer.length,'Truncated ZIP');
  files.push({name:buffer.subarray(at+30,at+30+nameLength).toString('utf8'),
   data:buffer.subarray(start,start+size)});
  at=start+size;
 }
 return files;
}
function assertFolder(files,id){
 const contents=files.filter(f=>f.name.startsWith(id+'/'));
 assert.equal(contents.length,9,'Wrong number of files in '+id);
 assert.deepEqual(contents.map(x=>x.name),[
  ...Array.from({length:6},(_,i)=>id+'/slide-'+String(i+1).padStart(2,'0')+'.png'),
  id+'/caption.txt',id+'/publish-instructions.txt',id+'/checklist.json'
 ]);
 for(const {data} of contents.slice(0,6)){
  assert.equal(data.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(data.readUInt32BE(16),1080);
  assert.equal(data.readUInt32BE(20),1350);
 }
 assert.ok(contents[6].data.toString('utf8').length>60);
 assert.match(contents[7].data.toString('utf8'),/Instagram/);
 const checklist=JSON.parse(contents[8].data.toString('utf8'));
 assert.equal(checklist.carouselId,id);
 assert.equal(checklist.status,'approved');
 assert.equal(checklist.published,false);
 assert.equal(checklist.checks.length,7);
 assert.ok(checklist.checks.every(x=>x.pass===true));
 if(id==='carousel-photo-archive'||id==='carousel-mixed-narrative')
  assert.match(contents[7].data.toString('utf8'),/Это текстовая версия/);
}
test('build script makes exactly five ZIPs, each using existing approved bundle schema',async()=>{
 const files=(await readdir(dir)).filter(x=>x.endsWith('.zip')).sort();
 assert.equal(files.length,5);
 for(const id of ids){
  const name=files.find(x=>x.startsWith(id+'-publish-'));
  assert.ok(name,'Missing '+id);
  assertFolder(unzip(await readFile(join(dir,name))),id);
 }
 const bundleName=files.find(x=>x.startsWith('persona-carousels-publish-'));
 assert.ok(bundleName);
 const all=unzip(await readFile(join(dir,bundleName)));
 assert.equal(all.length,36);
 for(const id of ids)assertFolder(all,id);
});
test('self-test assets must not be published as a real GitHub Release',async()=>{
 const meta=JSON.parse(await readFile(join(dir,'release-metadata.json'),'utf8'));
 assert.equal(meta.files.length,5);
 assert.equal(meta.testOnly,true);
 assert.equal(meta.carousels.length,4);
 assert.equal(meta.previewFiles.length,24);
 const previews=(await readdir(join(dir,'previews'))).sort();
 assert.deepEqual(previews,meta.previewFiles.slice().sort());
 const bundle=files.find(x=>x.startsWith('persona-carousels-publish-'));
 const combined=unzip(await readFile(join(dir,bundle)));
 for(const [id,alias] of [
  ['carousel-baseline-pause','baseline-pause'],
  ['carousel-why-director-leaves-question','why-director'],
  ['carousel-photo-archive','photo-archive'],
  ['carousel-mixed-narrative','mixed-narrative']
 ]){
  for(let i=1;i<=6;i++){
   const suffix='slide-'+String(i).padStart(2,'0')+'.png';
   const preview=await readFile(join(dir,'previews',alias+'-'+suffix));
   const source=combined.find(x=>x.name===id+'/'+suffix);
   assert.ok(source,'Missing ZIP pixel source: '+id+'/'+suffix);
   assert.ok(preview.equals(source.data),'Standalone preview must equal ZIP PNG bytes');
   assert.equal(preview.readUInt32BE(16),1080);
   assert.equal(preview.readUInt32BE(20),1350);
  }
 }
});
