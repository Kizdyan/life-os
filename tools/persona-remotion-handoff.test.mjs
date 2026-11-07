import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {compileRemotionHandoff,exportRemotionHandoff} from './persona-remotion-handoff.mjs';
const project={version:1,clips:[{path:'a.mp4',startSec:1,durationSec:2},{path:'b.mov',startSec:0.5,durationSec:1.5}]};
test('handoff produces deterministic frame-accurate sequence without rendering',()=>{
 const result=compileRemotionHandoff(project);
 assert.equal(result.composition.durationInFrames,105);
 assert.deepEqual(result.clips.map(x=>x.fromFrame),[0,60]);
 assert.equal(result.clips[0].sourceStartFrame,30);
 assert.equal(result.rendered,false);
 assert.equal(result.publicationApproved,false);
});
test('handoff rejects invalid clips and composition',()=>{
 assert.throws(()=>compileRemotionHandoff({...project,clips:[{path:'a.mp4',startSec:0,durationSec:-1}]}),/duration/);
 assert.throws(()=>compileRemotionHandoff({...project,clips:[{path:'payload.sh',startSec:0,durationSec:1}]}),/path/);
 assert.throws(()=>compileRemotionHandoff(project,{fps:0}),/composition/);
});
test('handoff checks actual local files and never overwrites output',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-remotion-'));
 try{
  const input=join(dir,'timeline.json'),output=join(dir,'handoff');
  await writeFile(join(dir,'a.mp4'),'test-video-a');
  await writeFile(join(dir,'b.mov'),'test-video-b');
  await writeFile(input,JSON.stringify(project));
  const result=await exportRemotionHandoff({input,output});
  assert.equal(result.clips.length,2);
  assert.equal(JSON.parse(await readFile(join(output,'remotion-handoff.json'),'utf8')).kind,'PERSONA_REMOTION_HANDOFF');
  await assert.rejects(exportRemotionHandoff({input,output}),/EEXIST/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('handoff rejects traversal outside project',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-remotion-traversal-'));
 try{
  const input=join(dir,'timeline.json');
  await writeFile(input,JSON.stringify({version:1,clips:[{path:'../other.mp4',startSec:0,durationSec:1}]}));
  await assert.rejects(exportRemotionHandoff({input,output:join(dir,'out')}),/outside timeline directory/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
