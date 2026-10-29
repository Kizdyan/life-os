import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyze,assemble } from './persona-semantic-montage.mjs';
import { parseWhisperJson, chooseForBrief, plan,transcribe,overlap,similarity } from './persona-semantic-autoselect.mjs';
const mk=()=>mkdtemp(join(tmpdir(),'persona-asr-select-'));
const put=(p,v)=>writeFile(p,JSON.stringify(v));
const whisper=(words)=>({transcription:words.map(([text,a,b])=>({text,offsets:{from:a*1000,to:b*1000}}))});
const brief={version:1,sourceFormat:'reel',script:[{order:1,line:'Я актёр. И ещё пишу музыку.',durationSec:3},{order:2,line:'И у нас есть проблема.',durationSec:4}],shots:[{order:1,durationSec:3},{order:2,durationSec:4}]};
test('Russian transcription matching normalizes ё, rejects unrelated phrases',()=>{
 assert.equal(overlap('Я актёр. Ещё пишу музыку','Я актер, еще пишу музыку'),1);
 assert.ok(similarity('Пишу музыку','Пишу музыку')>0.99);
 assert.equal(overlap('Пишу музыку','Варю суп и ем картошку'),0);
});
test('Whisper JSON parser reads timestamped tokens and rejects invalid offsets',()=>{
 const result=parseWhisperJson({transcription:[{text:' entire speech',offsets:{from:0,to:2500},tokens:[
  {text:' Я',offsets:{from:0,to:150}},
  {text:' актёр',offsets:{from:200,to:700}},
  {text:' пишу',offsets:{from:900,to:1300}},
  {text:' музыку',offsets:{from:1300,to:2000}}
 ]}]},3);
 assert.equal(result.length,4);
 assert.equal(result[3].endSec,2);
 assert.throws(()=>parseWhisperJson(whisper([['Ура',0,16]]),2),/outside source/);
});
test('Picks cleaner complete spoken take, detects missing dialogue and prevents reused overlap',()=>{
 const sources=[
  {id:'takeA_bad',durationSec:5,segments:parseWhisperJson(whisper([['Я',.1,.2],['актёр',.25,.5],['ну',.6,.7],['пишу',.8,1],['музыку',1.1,1.5]]),5)},
  {id:'takeA_good',durationSec:5,segments:parseWhisperJson(whisper([['Я',.1,.3],['актёр',.3,.8],['И',.8,.9],['ещё',.9,1.2],['пишу',1.2,1.6],['музыку',1.6,2.1]]),5)},
  {id:'takeB_good',durationSec:5,segments:parseWhisperJson(whisper([['И',.2,.4],['у',.4,.5],['нас',.5,.75],['есть',.75,.9],['проблема',.9,1.8]]),5)}
 ];
 const choices=chooseForBrief(brief,sources);
 assert.equal(choices.length,2);
 assert.equal(choices[0].sourceId,'takeA_good');
 assert.equal(choices[1].sourceId,'takeB_good');
 assert.ok(choices.every(c=>c.confidence>=.75&&c.reason.includes('NOT assessed')));
 assert.throws(()=>chooseForBrief(brief,sources.filter(x=>x.id!=='takeB_good')),/Manual review required/);
});
test('Avoids technically black footage even if ASR transcript matches better',()=>{
 const segments=parseWhisperJson(whisper([['Я',.1,.3],['актёр',.3,.8],['И',.8,.9],['ещё',.9,1.2],['пишу',1.2,1.6],['музыку',1.6,2.1]]),4);
 const sources=[
  {id:'black',durationSec:4,segments,technicalQuality:{blackIntervals:[{startSec:0,endSec:2.5}]}},
  {id:'clear',durationSec:4,segments,technicalQuality:{blackIntervals:[]}}
 ];
 const one={...brief,script:[brief.script[0]],shots:[brief.shots[0]]};
 assert.equal(chooseForBrief(one,sources)[0].sourceId,'clear');
 assert.throws(()=>chooseForBrief(one,sources.slice(0,1)),/Manual review required/);
});
test('End-to-end decisions JSON from local Whisper fixture, output non-overwrite, no false auto-approval',async()=>{
 const d=await mk();
 try{
  const analysis=join(d,'analysis.json'),briefPath=join(d,'brief.json'),out=join(d,'decisions.json');
  const sources=[{id:'takeA_good',durationSec:5},{id:'takeB_good',durationSec:5}];
  await put(analysis,{kind:'persona-evidence-v1',version:1,sources});
  await put(briefPath,brief);
  await put(join(d,'takeA_good-whisper.json'),whisper([['Я',.1,.3],['актёр',.3,.8],['И',.8,.9],['ещё',.9,1.2],['пишу',1.2,1.6],['музыку',1.6,2.1]]));
  await put(join(d,'takeB_good-whisper.json'),whisper([['И',.2,.4],['у',.4,.5],['нас',.5,.75],['есть',.75,.9],['проблема',.9,1.8]]));
  const outcome=await plan(analysis,briefPath,out);assert.equal(outcome.choices,2);
  const data=JSON.parse(await readFile(out,'utf8'));
  assert.equal(data.choices.length,2);assert.ok(!('approved' in data));
  await assert.rejects(()=>plan(analysis,briefPath,out),/already exists/);
 }finally{await rm(d,{recursive:true,force:true})}
});
test('offline Whisper execution requires model present and does not download a model',{skip:process.platform==='win32'},async()=>{
 const d=await mk();
 try{
  const analysis=join(d,'analysis.json');await put(analysis,{version:1,kind:'persona-evidence-v1',sources:[{id:'test',hasAudio:true,audioPath:'test.wav',durationSec:2}]});
  await writeFile(join(d,'test.wav'),'fake-audio');
  const exe=join(d,'fake-whisper.cjs');
  await writeFile(exe,`#!/usr/bin/env node
const fs=require('fs');const args=process.argv;const p=args[args.indexOf('-of')+1];fs.writeFileSync(p+'.json',JSON.stringify({transcription:[{text:'hello',offsets:{from:0,to:1000}}]}));
`);
  const {chmod}=await import('node:fs/promises');await chmod(exe,0o755);
  const model=join(d,'model.bin');await writeFile(model,Buffer.alloc(1024*1024+1));
  const outcome=await transcribe(analysis,exe,model);
  assert.equal(outcome.results[0].segments,1);
  await assert.rejects(()=>transcribe(analysis,exe,model),/already exists/);
 }finally{await rm(d,{recursive:true,force:true})}
});
const mediaTools=['ffmpeg','ffprobe'].every(bin=>spawnSync(bin,['-version'],{encoding:'utf8'}).status===0);
test('real synthetic video -> evidence -> fixture ASR -> automatic choices -> verified render JSON -> FFmpeg',{skip:!mediaTools},async()=>{
 const d=await mk();
 try {
  const paths=[join(d,'clipA.mp4'),join(d,'clipB.mp4')];
  for(let i=0;i<2;i++){
   const r=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c='+(i?'red':'blue')+':s=320x240:r=25','-f','lavfi','-i','sine=frequency=440:sample_rate=16000','-t','2.6','-c:v','mpeg4','-c:a','aac','-shortest',paths[i]],{encoding:'utf8',timeout:30000});
   assert.equal(r.status,0,r.stderr);
  }
  const originals=await Promise.all(paths.map(p=>readFile(p)));
  const sources=join(d,'sources.json');await put(sources,{version:1,sources:paths.map((path,i)=>({id:'take'+i,path}))});
  const evidence=await analyze(sources,join(d,'evidence'));
  assert.equal(evidence.sources,2);
  await put(join(d,'brief.json'),brief);
  await put(join(d,'evidence','take0-whisper.json'),whisper([['Я',.1,.3],['актёр',.3,.8],['И',.8,.9],['ещё',.9,1.2],['пишу',1.2,1.6],['музыку',1.6,2.1]]));
  await put(join(d,'evidence','take1-whisper.json'),whisper([['И',.2,.4],['у',.4,.5],['нас',.5,.75],['есть',.75,.9],['проблема',.9,1.8]]));
  const decision=join(d,'decisions.json');await plan(evidence.analysis,join(d,'brief.json'),decision);
  const assembled=await assemble(decision,join(d,'render-project.json'));
  assert.equal(assembled.clips,2);
  assert.ok(assembled.durationSec>3);
  const project=JSON.parse(await readFile(assembled.project,'utf8'));
  assert.equal(project.clips[0].path,paths[0]);assert.equal(project.clips[1].path,paths[1]);
  const rendered=join(d,'proof.mp4');
  const ff=spawnSync('ffmpeg',['-v','error','-i',paths[0],'-t','0.6','-vf','scale=1080:1920,setsar=1','-c:v','libx264','-preset','ultrafast','-an',rendered],{encoding:'utf8',timeout:120000});
  assert.equal(ff.status,0,ff.stderr);
  assert.ok((await stat(rendered)).size>1000);
  for(let i=0;i<paths.length;i++)assert.deepEqual(await readFile(paths[i]),originals[i]);
  await writeFile(paths[0],Buffer.from('tampered'));
  await assert.rejects(()=>assemble(decision,join(d,'refuse-render.json')),/Source modified/);
 } finally {await rm(d,{recursive:true,force:true})}
});
