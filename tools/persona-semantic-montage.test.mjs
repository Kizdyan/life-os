import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, assemble, sharedWords } from './persona-semantic-montage.mjs';

const mediaTools=['ffmpeg','ffprobe'].every(c=>spawnSync(c,['-version'],{encoding:'utf8'}).status===0);
const mk=(p,x)=>writeFile(p,JSON.stringify(x));
const minimalBrief={version:1,sourceFormat:'reel',script:[
 {order:1,line:'Я актёр. И ещё пишу музыку.',durationSec:2},
 {order:2,line:'И у нас есть проблема.',durationSec:2}
],shots:[{order:1,durationSec:2},{order:2,durationSec:2}]};
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
  const manuallyConfirmed={...chosen,choices:[
   {...chosen.choices[0],confidence:null,transcriptSource:'manual-review',manualTranscriptReview:true,
    reason:'Author checked the audible words and marked this exact source range manually'},
   chosen.choices[1]
  ]};
  await mk(decisions,manuallyConfirmed);
  const recovered=await assemble(decisions,join(d,'manual-recovery.json'));
  const recoveredReview=JSON.parse(await readFile(recovered.review,'utf8'));
  assert.equal(recoveredReview.cuts[0].transcriptSource,'manual-review');
  assert.match(recoveredReview.notes,/manual transcript/);
  await assert.rejects(()=>assemble(decisions,assembled.project),/Output exists/);
  await writeFile(clips[0],'tampered');
  await assert.rejects(()=>assemble(decisions,join(d,'other.json')),/Source modified/);
 }finally{await rm(d,{recursive:true,force:true})}
});
test('One MP4 becomes a two-shot timeline while preserving its original bytes',{skip:!mediaTools},async()=>{
 const d=await mkdtemp(join(tmpdir(),'persona-one-source-'));
 try {
  const video=join(d,'single-recording.mp4');
  const creation=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=s=240x320:r=25','-f','lavfi','-i','sine=frequency=440:sample_rate=16000','-t','5','-c:v','mpeg4','-c:a','aac','-shortest',video],{encoding:'utf8',timeout:30000});
  assert.equal(creation.status,0,creation.stderr);
  const original=await readFile(video);
  const src=join(d,'source.json');await mk(src,{version:1,sources:[{id:'one',path:video}]});
  const analyzed=await analyze(src,join(d,'evidence'));
  assert.equal(analyzed.sources,1);
  const brief=join(d,'brief.json');await mk(brief,minimalBrief);
  const choice=join(d,'choices.json');await mk(choice,{version:1,analysisPath:analyzed.analysis,briefPath:brief,choices:[
   {beat:1,sourceId:'one',startSec:0.1,durationSec:1.2,confidence:.95,transcript:'Я актёр. И ещё пишу музыку.',reason:'First standalone line in same continuous recording'},
   {beat:2,sourceId:'one',startSec:2.8,durationSec:1.2,confidence:.93,transcript:'И у нас есть проблема.',reason:'Second standalone line later in recording'}
  ]});
  const overlapping={version:1,analysisPath:analyzed.analysis,briefPath:brief,choices:[
   {beat:1,sourceId:'one',startSec:0.1,durationSec:1.2,confidence:.95,transcript:'Я актёр. И ещё пишу музыку.',reason:'First standalone line in same continuous recording'},
   {beat:2,sourceId:'one',startSec:0.8,durationSec:1.2,confidence:.93,transcript:'И у нас есть проблема.',reason:'Overlapping proposed clip that must be rejected'}
  ]};
  await mk(choice,overlapping);
  await assert.rejects(()=>assemble(choice,join(d,'overlap.json')),/Overlapping choices/);
  await assert.rejects(()=>stat(join(d,'overlap.json')),/ENOENT/);
  await mk(choice,{...overlapping,choices:[overlapping.choices[0],{...overlapping.choices[1],startSec:2.8}]});
  const assembled=await assemble(choice,join(d,'timeline.json'));
  assert.equal(assembled.clips,2);
  const timeline=JSON.parse(await readFile(assembled.project,'utf8'));
  assert.deepEqual(timeline.clips.map(x=>x.path),[video,video]);
  assert.ok(timeline.clips[0].startSec+timeline.clips[0].durationSec<timeline.clips[1].startSec);
  assert.deepEqual(await readFile(video),original);
 } finally {await rm(d,{recursive:true,force:true})}
});

test('preview assembly writes only explicitly selected ordered beats and reports missing scenes',async()=>{
 const d=await mkdtemp(join(tmpdir(),'persona-preview-assembly-'));
 try{
  const source=join(d,'source.mp4'); const bytes=Buffer.from('fixture'); await writeFile(source,bytes);
  const brief=join(d,'brief.json'),analysis=join(d,'analysis.json'),decisions=join(d,'decisions.json');
  await mk(brief,minimalBrief);
  await mk(analysis,{version:1,kind:'persona-evidence-v1',sources:[{id:'take',path:source,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),durationSec:3}]});
  await mk(decisions,{version:1,mode:'preview',analysisPath:analysis,briefPath:brief,missingBeats:[2],choices:[{beat:1,sourceId:'take',startSec:0,durationSec:1,confidence:.9,transcript:'Я актёр. И ещё пишу музыку.',reason:'Matched transcript; visual and performance quality NOT assessed.'}]});
  const result=await assemble(decisions,join(d,'preview.json'));
  assert.equal(result.clips,1);
  const review=JSON.parse(await readFile(result.review,'utf8'));
  assert.deepEqual(review.missingBeats,[2]);
 }finally{await rm(d,{recursive:true,force:true})}
});

test('B03 music tail requires a word timestamp or an explicit manual boundary',async()=>{
 const d=await mkdtemp(join(tmpdir(),'persona-b03-boundary-'));
 try{
  const source=join(d,'b03.mp4'),bytes=Buffer.from('b03fixture');await writeFile(source,bytes);
  const brief=join(d,'brief.json'),analysis=join(d,'analysis.json'),decisions=join(d,'decisions.json');
  const musicBrief={version:1,sourceFormat:'reel',script:[{order:1,line:'Почему? Сейчас напишу колыбельную.',durationSec:4},{order:2,line:'Финал.',durationSec:1}],shots:[{order:1,durationSec:4,action:'После реплики музыкальный фрагмент на клавишах'},{order:2,durationSec:1}]};
  await mk(brief,musicBrief);
  await mk(analysis,{version:1,kind:'persona-evidence-v1',sources:[{id:'b03',path:source,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),durationSec:5},{id:'end',path:source,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),durationSec:5}]});
  const base={version:1,analysisPath:analysis,briefPath:brief,choices:[
   {beat:1,sourceId:'b03',startSec:1,durationSec:3,confidence:.9,transcript:'Почему? Сейчас напишу колыбельную.',reason:'Transcript match; visual and performance quality NOT assessed.',postSpeechMusicPreserved:true,speechBoundaryConfidence:'segment'},
   {beat:2,sourceId:'end',startSec:0,durationSec:1,confidence:.9,transcript:'Финал.',reason:'Transcript match; visual and performance quality NOT assessed.'}
  ]};
  await mk(decisions,base);
  await assert.rejects(()=>assemble(decisions,join(d,'blocked.json')),/Post-speech music needs word timing or manual boundary/);
  await mk(decisions,{...base,choices:[{...base.choices[0],manualMusicBoundarySec:2.25},base.choices[1]]});
  const result=await assemble(decisions,join(d,'timeline.json'));
  const timeline=JSON.parse(await readFile(result.project,'utf8'));
  assert.deepEqual(timeline.clips[0].audioTreatment,{speechDurationSec:1.25,preserveMusicTail:true,boundarySource:'manual'});
 }finally{await rm(d,{recursive:true,force:true})}
});
