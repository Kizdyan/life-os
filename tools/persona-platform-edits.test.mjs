import {test} from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {platformProfiles,assessPlatformTimeline,safeCaptionPosition,renderBrollLayer,assertReviewedLayoutCurrent,renderSoftTransitions} from './persona-platform-edits.mjs';
test('reviewed overlays and face regions cannot silently attach to another edit layout',()=>{
 const original={clips:[{beat:1,path:'take',startSec:0,durationSec:5},{beat:2,path:'take',startSec:10,durationSec:5}],overlays:[{timelineStartSec:6}]};
 assert.doesNotThrow(()=>assertReviewedLayoutCurrent(original,original));
 assert.throws(()=>assertReviewedLayoutCurrent(original,{clips:[{...original.clips[0],durationSec:8},{...original.clips[1],durationSec:2}]}),/another cut layout/);
});
test('platform limits never truncate a confirmed utterance or fabricate missing context',()=>{
 const clips=[{startSec:1,durationSec:18},{startSec:22,durationSec:18}];
 assert.equal(assessPlatformTimeline(clips,platformProfiles[0]).renderAllowed,false);
 assert.equal(assessPlatformTimeline(clips,platformProfiles[1]).renderAllowed,true);
 assert.match(assessPlatformTimeline([{startSec:0,durationSec:5}],platformProfiles[2]).warnings.join(),/Недостаточно/);
 assert.throws(()=>assessPlatformTimeline([{startSec:-1,durationSec:3}],platformProfiles[0]));
});
test('captions avoid author-marked protected areas and reject impossible placement',()=>{
 assert.equal(safeCaptionPosition([{x:.1,y:.58,width:.8,height:.2,authorReviewed:true}]),.38);
 assert.throws(()=>safeCaptionPosition([{x:0,y:0,width:1,height:1,authorReviewed:true}]),/No safe/);
 assert.throws(()=>safeCaptionPosition([{x:0,y:0,width:1,height:.2,authorReviewed:false}]));
});
const available=spawnSync('ffmpeg',['-version']).status===0;
function run(args){const r=spawnSync('ffmpeg',args,{maxBuffer:10*1024*1024,timeout:60000});assert.equal(r.status,0,r.stderr?.toString());return r.stdout}
test('Reels soft visual joins preserve duration, original and decoded audio',{skip:!available},async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-soft-cuts-'));try{
  const input=join(root,'in.mp4'),output=join(root,'out.mp4');
  run(['-v','error','-f','lavfi','-i','color=c=blue:s=320x568:r=30:d=0.5','-f','lavfi','-i','color=c=red:s=320x568:r=30:d=0.5','-f','lavfi','-i','sine=frequency=440:duration=1','-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[v]','-map','[v]','-map','2:a','-c:v','libx264','-c:a','aac',input]);
  const original=await readFile(input);await renderSoftTransitions({videoPath:input,outputPath:output,clips:[{durationSec:.5},{durationSec:.5}]});
  const pixel=t=>run(['-v','error','-ss',String(t),'-i',output,'-frames:v','1','-vf','scale=1:1','-f','rawvideo','-pix_fmt','rgb24','-']);
  assert.ok(pixel(.533)[0]>20&&pixel(.533)[2]>20,'A real blend must appear around the join');
  const audio=p=>run(['-v','error','-i',p,'-vn','-f','s16le','-']);assert.deepEqual(audio(output),audio(input));assert.deepEqual(await readFile(input),original);
  const probe=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','json',output],{encoding:'utf8'});assert.ok(Math.abs(Number(JSON.parse(probe.stdout).format.duration)-1)<.05);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('real B-roll layer covers only its interval, retains audio and refuses a forged SHA',{skip:!available},async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-layer-'));
 try{
  const base=join(root,'base.mp4'),broll=join(root,'broll.mp4'),output=join(root,'layer.mp4');
  run(['-v','error','-f','lavfi','-i','color=c=blue:s=1080x1920:r=15:d=1','-f','lavfi','-i','sine=frequency=440:duration=1','-c:v','libx264','-preset','ultrafast','-c:a','aac',base]);
  run(['-v','error','-f','lavfi','-i','color=c=red:s=320x568:r=15:d=1','-c:v','libx264','-preset','ultrafast',broll]);
  const original=await readFile(broll),sha256=createHash('sha256').update(original).digest('hex');
  await assert.rejects(renderBrollLayer({videoPath:base,outputPath:output,durationSec:1,overlays:[{path:broll,sha256:'0'.repeat(64),startSec:0,durationSec:.4,timelineStartSec:.2,authorReviewed:true}]}),/SHA/);
  await renderBrollLayer({videoPath:base,outputPath:output,durationSec:1,overlays:[{path:broll,sha256,startSec:0,durationSec:.4,timelineStartSec:.2,authorReviewed:true}]});
  const pixel=t=>run(['-v','error','-ss',String(t),'-i',output,'-frames:v','1','-vf','scale=1:1','-f','rawvideo','-pix_fmt','rgb24','-']);
  assert.ok(pixel(.4)[0]>pixel(.4)[2]);assert.ok(pixel(.8)[2]>pixel(.8)[0]);
  const audio=p=>run(['-v','error','-i',p,'-vn','-f','s16le','-']);assert.deepEqual(audio(output),audio(base));
  assert.deepEqual(await readFile(broll),original);
 }finally{await rm(root,{recursive:true,force:true})}
});
