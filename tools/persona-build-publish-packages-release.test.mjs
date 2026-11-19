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
 const archives=(await readdir(dir)).filter(x=>x.endsWith('.zip'));
 assert.equal(archives.length,5);
 assert.deepEqual(archives.slice().sort(),m.files.slice().sort());
 for(const filename of archives){
  const buffer=await readFile(join(dir,filename));
  assert.ok(buffer.length>1000,'Empty ZIP: '+filename);
  assert.equal(buffer.readUInt32LE(0),0x04034b50,'Invalid ZIP: '+filename);
 }
});
