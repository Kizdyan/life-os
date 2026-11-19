#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const dir=resolve('dist/baseline-review-v2');
const info=JSON.parse(await readFile(join(dir,'review-metadata.json'),'utf8'));
const assets=(await readdir(dir)).filter(x=>x.endsWith('.png')||x.endsWith('.zip')).sort();
test('review-only v2 contains 8 non-empty assets with original 1080x1350 pixels',async()=>{
 assert.equal(info.textApproved,true);assert.equal(info.designApproved,false);
 assert.equal(info.files.length,8);assert.deepEqual(assets,info.files.slice().sort());
 const pngs=assets.filter(x=>x.endsWith('.png'));assert.equal(pngs.length,7);
 for(const name of pngs){
  const image=await readFile(join(dir,name));
  assert.equal(image.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.ok(image.length>2000);
  const contact=name==='contact-sheet-baseline-pause.png';
  assert.equal(image.readUInt32BE(16),1080);
  assert.equal(image.readUInt32BE(20),contact?1620:1350);
 }
});
test('single ZIP has exactly six original PNGs, caption and unapproved design checklist',async()=>{
 const name=assets.find(x=>x.endsWith('.zip'));assert.ok(name);
 const z=await readFile(join(dir,name));let pos=0,entries=[];
 while(pos+30<=z.length&&z.readUInt32LE(pos)===0x04034b50){
  const count=z.readUInt16LE(pos+26),extra=z.readUInt16LE(pos+28),
   n=z.readUInt32LE(pos+18),start=pos+30+count+extra;
  assert.ok(start+n<=z.length);
  entries.push({name:z.subarray(pos+30,pos+30+count).toString('utf8'),
   bytes:z.subarray(start,start+n)});
  pos=start+n;
 }
 assert.equal(entries.length,9);
 for(let i=0;i<6;i++){
  const expected='baseline-pause-slide-'+String(i+1).padStart(2,'0')+'.png';
  assert.ok(entries[i].name.endsWith('slide-'+String(i+1).padStart(2,'0')+'.png'));
  assert.ok((await readFile(join(dir,expected))).equals(entries[i].bytes));
 }
 assert.equal(entries[6].name,'carousel-baseline-pause/caption.txt');
 assert.equal(entries[7].name,'carousel-baseline-pause/publish-instructions.txt');
 assert.equal(entries[8].name,'carousel-baseline-pause/checklist.json');
 const check=JSON.parse(entries[8].bytes.toString('utf8'));
 assert.equal(check.designApproved,false);assert.equal(check.textApproved,true);
 assert.equal(check.published,false);assert.equal(check.status,'design-review-required');
 assert.match(entries[7].bytes.toString('utf8'),/НЕ утверждено|не утверждено/);
});
