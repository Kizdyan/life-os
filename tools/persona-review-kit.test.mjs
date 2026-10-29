import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareReviewKit} from './persona-review-kit.mjs';

test('review kit requires existing finished Persona draft and does not create a directory on refusal',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-kit-refusal-'));
 try{
  await assert.rejects(()=>prepareReviewKit({draftDir:dir}),/ENOENT/);
  await assert.rejects(()=>stat(join(dir,'editorial-review-kit')),/ENOENT/);
  const result=join(dir,'RESULT.json');
  await writeFile(result,JSON.stringify({status:'failed',distributionAllowed:false}));
  await assert.rejects(()=>prepareReviewKit({draftDir:dir}),/finished technical QA/);
  await assert.rejects(()=>stat(join(dir,'editorial-review-kit')),/ENOENT/);
 }finally{await rm(dir,{recursive:true,force:true})}
});

test('review kit refuses unexpected publication approval or forged QA pass',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-kit-publish-gate-'));
 try{
  const result=join(dir,'RESULT.json'),qa=join(dir,'qa.json');
  await writeFile(result,JSON.stringify({status:'awaiting-author-review',distributionAllowed:false,
   output:join(dir,'render.mp4'),qaPath:qa}));
  await writeFile(qa,JSON.stringify({handoff:{status:'approved',errors:[]},
   evidence:{fileExists:true,probeVerified:true}}));
  await assert.rejects(()=>prepareReviewKit({draftDir:dir}),/Refusing unverified or already approved/);
  await assert.rejects(()=>stat(join(dir,'editorial-review-kit')),/ENOENT/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
