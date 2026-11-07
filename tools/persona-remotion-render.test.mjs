import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {evaluateRender,renderRemotion} from './persona-remotion-render.mjs';
const handoff={kind:'PERSONA_REMOTION_HANDOFF',composition:{width:1080,height:1920,fps:30,durationInFrames:90}};
const probe={streams:[{codec_type:'video',width:1080,height:1920,avg_frame_rate:'30/1'}],format:{duration:'3.000'}};
test('technical match never grants visual or publication approval',()=>{
 const r=evaluateRender(handoff,probe,{outputSize:100000});
 assert.equal(r.status,'TECHNICAL_PASS_REQUIRES_VISUAL_REVIEW');
 assert.equal(r.visualApproved,false);assert.equal(r.publicationApproved,false);
});
test('dimension, frame rate, duration and missing output fail closed',()=>{
 for(const p of [{...probe,streams:[{...probe.streams[0],width:720}]},
  {...probe,streams:[{...probe.streams[0],avg_frame_rate:'25/1'}]},
  {...probe,format:{duration:'7'}}]){
  assert.equal(evaluateRender(handoff,p,{outputSize:100000}).status,'FAIL');
 }
 assert.equal(evaluateRender(handoff,probe,{outputSize:0}).status,'FAIL');
});
test('renderer refuses to run without locally installed dependencies',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-render-gate-'));
 try{
  await writeFile(join(dir,'remotion-handoff.json'),JSON.stringify(handoff));
  await assert.rejects(renderRemotion({workspace:dir,output:join(dir,'out','video.mp4')}),/not installed/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
