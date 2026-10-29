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
test('whisper.cpp terminal control token outside source does not reject timed speech',()=>{
 const result=parseWhisperJson({transcription:[{text:' Редактор субтитров',offsets:{from:0,to:2000},tokens:[
  {text:'[_BEG_]',offsets:{from:0,to:0}},
  {text:' Редактор',offsets:{from:0,to:700}},
  {text:' субтитров',offsets:{from:700,to:990}},
  {text:'[_TT_100]',offsets:{from:2000,to:2000}}
 ]}]},1);
 assert.deepEqual(result,[
  {startSec:0,endSec:.7,text:'Редактор'},
  {startSec:.7,endSec:.99,text:'субтитров'}
 ]);
});
test('whisper.cpp JSON-full falls back to segment offsets when token offsets are absent',()=>{
 const data={transcription:[{
  text:' Я актёр. И ещё пишу музыку.',offsets:{from:500,to:2800},
  tokens:[{text:' Я',id:1,p:.9},{text:' актёр',id:2,p:.9},{text:' музыку',id:3,p:.9}]
 }]};
 const segments=parseWhisperJson(data,4);
 assert.deepEqual(segments,[{startSec:.5,endSec:2.8,text:'Я актёр. И ещё пишу музыку.'}]);
 const matched=chooseForBrief({script:[{order:1,line:'Я актёр. И ещё пишу музыку.'}]},[
   {id:'take-real-json',durationSec:4,segments}
 ]);
 assert.equal(matched[0].sourceId,'take-real-json');
 assert.ok(matched[0].durationSec>2);
});
test('mixed token timestamps cannot silently truncate spoken segment',()=>{
 const data={transcription:[{
  text:' И у нас есть проблема.',offsets:{from:300,to:1800},
  tokens:[{text:' И',offsets:{from:300,to:400}}, {text:' у нас есть проблема.'}]
 }]};
 const parts=parseWhisperJson(data,3);
 assert.equal(parts.length,1);
 assert.match(parts[0].text,/проблема/);
});
test('whisper.cpp subword tokens are rejoined into complete Russian words',()=>{
 const data={transcription:[{text:' Композитор сочиняет.',offsets:{from:0,to:1500},tokens:[
  {text:' Компо',offsets:{from:0,to:400}},
  {text:'зитор',offsets:{from:400,to:900}},
  {text:' сочиняет',offsets:{from:900,to:1400}},
  {text:'.',offsets:{from:1400,to:1500}}
 ]}]};
 const segments=parseWhisperJson(data,2);
 assert.deepEqual(segments.map(x=>x.text),['Композитор','сочиняет.']);
 const choice=chooseForBrief({script:[{order:1,line:'Композитор сочиняет.'}]},[{id:'take',durationSec:2,segments}]);
 assert.equal(choice[0].sourceId,'take');
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
test('An explicit post-dialogue music cue preserves the full shot and rejects short takes',()=>{
 const musicBeat={version:1,sourceFormat:'reel',
  script:[{order:1,line:'Почему? Сейчас напишу колыбельную.',durationSec:6}],
  shots:[{order:1,durationSec:6,action:'Сухо; затем 2–3 секунды оригинальной музыки на клавишах'}]};
 const speech=parseWhisperJson(whisper([
  ['Почему',0.4,0.8],['сейчас',0.85,1.2],['напишу',1.25,1.6],['колыбельную',1.65,2.1]
 ]),8);
 const good={id:'music-complete',durationSec:8,segments:speech,technicalQuality:{blackIntervals:[]}};
 const chosen=chooseForBrief(musicBeat,[good]);
 assert.equal(chosen[0].sourceId,'music-complete');
 assert.ok(chosen[0].durationSec>=6,'post-dialogue music must not be clipped off');
 assert.match(chosen[0].reason,/post-speech music hold preserved/);
 assert.throws(()=>chooseForBrief(musicBeat,[{...good,id:'too-short',durationSec:4}]),/Manual review required/);
 assert.throws(()=>chooseForBrief(musicBeat,[{...good,technicalQuality:{blackIntervals:[{startSec:3,endSec:4}]}}]),/Manual review required/);
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

test('One long recording can supply two non-overlapping dialogue shots',()=>{
 const words=[
  ['Я',.5,.7],['актёр',.75,1],['И',1.05,1.15],['ещё',1.2,1.4],['пишу',1.45,1.7],['музыку',1.75,2.1],
  ['И',5.5,5.7],['у',5.75,5.9],['нас',5.95,6.1],['есть',6.2,6.45],['проблема',6.55,7.2]
 ];
 const source={id:'one-archive-take',durationSec:10,segments:parseWhisperJson(whisper(words),10),technicalQuality:{blackIntervals:[]}};
 const choices=chooseForBrief(brief,[source]);
 assert.equal(choices.length,2);
 assert.deepEqual(choices.map(x=>x.sourceId),['one-archive-take','one-archive-take']);
 assert.ok(choices[0].startSec+choices[0].durationSec<choices[1].startSec,'selected source windows must not overlap');
});

test('non-greedy alternative lets two utterances share a coarse Whisper segment safely',()=>{
 const coarse= {id:'archive',durationSec:6,segments:parseWhisperJson({
  transcription:[{text:'Я актёр. И ещё пишу музыку. И у нас есть проблема.',offsets:{from:400,to:4000}}]
 },6),technicalQuality:{blackIntervals:[]}};
 const alternative={id:'other-take',durationSec:4,segments:parseWhisperJson(whisper([
  ['Я',.4,.6],['актёр',.65,.9],['И',.95,1.05],['пишу',1.1,1.4],['музыку',1.45,1.8]
 ]),4),technicalQuality:{blackIntervals:[]}};
 const picks=chooseForBrief(brief,[coarse,alternative]);
 assert.deepEqual(picks.map(x=>x.sourceId),['other-take','archive']);
 assert.ok(picks.every(x=>x.confidence>=0.75));
 // A missing alternate must fail instead of recycling the same timeline range.
 assert.throws(()=>chooseForBrief(brief,[coarse]),/Manual review required/);
});
