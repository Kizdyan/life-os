import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {readAboutMeImage} from './persona-about-me-bridge.mjs';
test('local About Me route serves only manifest-bound unchanged image bytes',async()=>{
 const cache=await mkdtemp(join(tmpdir(),'persona-about-me-'));
 try{
  const id='12345678-1234-1234-1234-123456789abc',dir=join(cache,'about-me','reselection-'+id);
  await mkdir(dir,{recursive:true});
  const bytes=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(1500,1)]);
  const sha256=createHash('sha256').update(bytes).digest('hex'),shortlistFile='01-portrait-test.jpg';
  await writeFile(join(dir,shortlistFile),bytes);
  const manifest={version:1,kind:'persona-about-me-candidate',status:'AUTHOR_REVIEW_REQUIRED',selected:[{sha256,category:'portrait',shortlistFile}]};
  await writeFile(join(dir,'selection.json'),JSON.stringify(manifest));
  const r=await readAboutMeImage(cache,id,sha256);
  assert.equal(r.mime,'image/jpeg');assert.deepEqual(r.bytes,bytes);
  await assert.rejects(readAboutMeImage(cache,'../secret',sha256));
  await assert.rejects(readAboutMeImage(cache,id,'f'.repeat(64)));
  await writeFile(join(dir,shortlistFile),Buffer.concat([bytes,Buffer.from('changed')]));
  await assert.rejects(readAboutMeImage(cache,id,sha256),/hash mismatch/);
  await writeFile(join(dir,'selection.json'),JSON.stringify({...manifest,selected:[{sha256,category:'portrait',shortlistFile:'../secret.jpg'}]}));
  await assert.rejects(readAboutMeImage(cache,id,sha256),/not in package/);
 }finally{await rm(cache,{recursive:true,force:true})}
});
