import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, assemble, sharedWords } from './persona-semantic-montage.mjs';

const mediaTools=['ffmpeg','ffprobe'].every(c=>spawnSync(c,['-version'],{encoding:'utf8'}).status===0);
const mk=(p,x)=>writeFile(p,JSON.stringify(x));
test('speech matching rejects unrelated dialogue',()=>{
 assert.equal(sharedWords('Я актёр. Пишу музыку.','Я актёр, пишу музыку.'),1);
 assert.equal(sharedWords('Я актёр, пишу музыку','Картошка, свекла, суп'),0);
});
test('duplicate source ID rejected before opening video files',async()=>{
 const d=await mkdtemp(join(tmpdir(),'persona-semantic-invalid-'));
 try{
  const input=join(d,'sources.json');
  await mk(input,{version:1,sources:[{id:'same',path:'missing1.mp4'},{id:'same',path:'missing2.mp4'}]});
  await assert.rejects(()=>analyze(input,join(d,'evidence')),/repeated source ID/);
 }finally{await rm(d,{recursive:true,force:true})}
});
test('real evidence -> validated choices -> existing FFmpeg renderer -> untouched originals',{skip:!mediaTools},async()=>{
 const d=await mkdtemp(join(tmpdir(),'persona-semantic-integration-'));
 try{
  const clips=[join(d,'actor.mp4'),join(d,'composer.mp4')];
  for(let i=0;i<2;i++){
   const result=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c='+ (i?'red':'blue') +':s=320x240:r=25','-f','lavfi','-i','sine=frequency=440:sample_rate=16000','-t','2.5','-c:v','mpeg4','-c:a','aac','-shortest',clips[i]],{encoding:'utf8',timeout:30000});
   assert.equal(result.status,0,result.stderr);
  }
  const originals=await Promise.all(clips.map(p=>readFile(p)));
  const input=join(d,'sources.json');await mk(input,{version:1,sources:clips.map((path,i)=>({id:'take'+i,path}))});
  const result=await analyze(input,join(d,'evidence'));
  const evidence=JSON.parse(await readFile(result.analysis,'utf8'));
  assert.equal(evidence.sources.length,2);
  for(const source of evidence.sources){assert.equal(source.frames.length,3);assert.ok((await stat(source.audioPath)).size>0)}
  const brief=join(d,'brief.json');
  await mk(brief,{version:1,sourceFormat:'reel',script:[{order:1,line:'Я актёр. И ещё пишу музыку.',durationSec:2},{order:2,line:'И у нас есть проблема.',durationSec:2}],shots:[{order:1,durationSec:2},{order:2,durationSec:2}]});
  const decisions=join(d,'decisions.json');
  const chosen={version:1,analysisPath:result.analysis,briefPath:brief,choices:[
   {beat:1,sourceId:'take0',startSec:.1,durationSec:1.25,confidence:.92,transcript:'Я актёр. И ещё пишу музыку.',reason:'Complete scripted opening with adequate sound'},
   {beat:2,sourceId:'take1',startSec:.2,durationSec:1.3,confidence:.89,transcript:'И у нас есть проблема.',reason:'Dry and clear response with proper pause'}]};
  await mk(decisions,{...chosen,authorApproved:true});
  await assert.rejects(()=>assemble(decisions,join(d,'timeline.json')),/Do not import approval/);
  await mk(decisions,{...chosen,choices:[{...chosen.choices[0],transcript:'Картошка свёкла суп'},chosen.choices[1]]});
  await assert.rejects(()=>assemble(decisions,join(d,'timeline.json')),/does not sufficiently match/);
  await mk(decisions,chosen);
  const assembled=await assemble(decisions,join(d,'timeline.json'));
  assert.equal(assembled.clips,2);
  assert.equal(assembled.durationSec,2.55);
  const review=JSON.parse(await readFile(assembled.review,'utf8'));
  assert.equal(review.status,'needs-human-review');
  const renderer=join(dirname(fileURLToPath(import.meta.url)),'persona-timeline-render.mjs');
  const call=spawnSync(process.execPath,[renderer,assembled.project,join(d,'render.mp4')],{encoding:'utf8',timeout:120000});
  assert.equal(call.status,0,call.stderr);
  assert.ok((await stat(join(d,'render.mp4'))).size>1000);
  for(let i=0;i<clips.length;i++)assert.deepEqual(await readFile(clips[i]),originals[i]);
  await assert.rejects(()=>assemble(decisions,assembled.project),/Output exists/);
  await writeFile(clips[0],'tampered');
  await assert.rejects(()=>assemble(decisions,join(d,'other.json')),/Source modified/);
 }finally{await rm(d,{recursive:true,force:true})}
});