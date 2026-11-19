#!/usr/bin/env node
/** Release-mode verification. Unlike the synthetic unit test, metadata must be real. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const dir=resolve('dist/publish-packages');
test('five approved assets, never synthetic',async()=>{
 const m=JSON.parse(await readFile(join(dir,'release-metadata.json'),'utf8'));
 assert.equal(m.testOnly,false,'Test approvals may not be published');
 assert.equal(m.files.length,5);
 assert.equal(m.previewFiles.length,24);
 const archives=(await readdir(dir)).filter(x=>x.endsWith('.zip'));
 assert.equal(archives.length,5);
 assert.deepEqual(archives.slice().sort(),m.files.slice().sort());
 assert.deepEqual((await readdir(join(dir,'previews'))).sort(),m.previewFiles.slice().sort());
 for(const filename of archives){
  const buffer=await readFile(join(dir,filename));
  assert.ok(buffer.length>1000,'Empty ZIP: '+filename);
  assert.equal(buffer.readUInt32LE(0),0x04034b50,'Invalid ZIP: '+filename);
 }
 const combined=await readFile(join(dir,archives.find(x=>x.startsWith('persona-carousels-publish-'))));
 let at=0;const zipped=new Map();
 while(at+30<=combined.length&&combined.readUInt32LE(at)===0x04034b50){
  const nameLength=combined.readUInt16LE(at+26),extra=combined.readUInt16LE(at+28),
   size=combined.readUInt32LE(at+18),start=at+30+nameLength+extra;
  assert.ok(start+size<=combined.length);
  zipped.set(combined.subarray(at+30,at+30+nameLength).toString('utf8'),
   combined.subarray(start,start+size));
  at=start+size;
 }
 assert.equal(zipped.size,36);
 for(const [id,short] of [
  ['carousel-baseline-pause','baseline-pause'],
  ['carousel-why-director-leaves-question','why-director'],
  ['carousel-photo-archive','photo-archive'],
  ['carousel-mixed-narrative','mixed-narrative']
 ]){
  for(let i=1;i<=6;i++){
   const suffix='slide-'+String(i).padStart(2,'0')+'.png',
    png=await readFile(join(dir,'previews',short+'-'+suffix));
   assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
   assert.equal(png.readUInt32BE(16),1080);
   assert.equal(png.readUInt32BE(20),1350);
   assert.ok(png.equals(zipped.get(id+'/'+suffix)),'Standalone PNG differs from ZIP payload');
  }
 }
});
