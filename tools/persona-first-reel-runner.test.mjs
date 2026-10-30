import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, stat, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runFirstReel, validateDraftQa, validateFirstReelMode } from './persona-first-reel-runner.mjs';
import {renderReviewedReel} from './persona-reviewed-render.mjs';
const mediaTools=['ffmpeg','ffprobe'].every(bin=>spawnSync(bin,['-version'],{encoding:'utf8'}).status===0);
const mk=(p,x)=>writeFile(p,JSON.stringify(x));
test('two-shot live speech brief matches only the first two beats of the full Reel',async()=>{
 const two=JSON.parse(await readFile(new URL('../docs/persona-two-line-live-asr-check-2026-10-29.json',import.meta.url),'utf8'));
 const full=JSON.parse(await readFile(new URL('../docs/persona-first-reel-production-brief-2026-10-29.json',import.meta.url),'utf8'));
 assert.equal(two.script.length,2);
 assert.equal(two.shots.length,2);
 assert.equal(full.script.length,7);
 assert.deepEqual(two.script.map(x=>x.line),full.script.slice(0,2).map(x=>x.line));
 assert.deepEqual(two.shots.map(x=>x.order),[1,2]);
 assert.equal(two.sourceFormat,'reel');
});
test('missing inputs fail preflight without creating output directory',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-runner-preflight-'));
 try{await assert.rejects(()=>runFirstReel({sources:join(dir,'missing.json'),brief:join(dir,'no.json'),outputDir:join(dir,'output'),whisperCli:'no',whisperModel:'no'}),/Missing required local file/);
 await assert.rejects(()=>stat(join(dir,'output')),/ENOENT/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('runner exposes strict and incomplete preview modes without a silent fallback',()=>{
 assert.equal(validateFirstReelMode(), 'strict');
 assert.equal(validateFirstReelMode('preview'), 'preview');
 assert.throws(()=>validateFirstReelMode('fast'),/Invalid editorial decision mode/);
});
test('single run chains media evidence, mock ASR, cut decisions, renderer and QA stubs; originals untouched',{skip:!mediaTools||process.platform==='win32'},async()=>{
 const d=await mkdtemp(join(tmpdir(),'persona-runner-e2e-'));
 try{
 const videos=[join(d,'actor.mp4'),join(d,'composer.mp4')];
 for(let i=0;i<2;i++){
  const c=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c='+(i?'blue':'red')+':s=320x240:r=25','-f','lavfi','-i','sine=frequency=440:sample_rate=16000','-t','2.6','-c:v','mpeg4','-c:a','aac','-shortest',videos[i]],{encoding:'utf8',timeout:30000});
  assert.equal(c.status,0,c.stderr);
 }
 const originals=await Promise.all(videos.map(f=>readFile(f)));
 const sources=join(d,'sources.json'),brief=join(d,'brief.json');
 await mk(sources,{version:1,sources:videos.map((path,i)=>({id:'take'+i,path}))});
 await mk(brief,{version:1,sourceFormat:'reel',script:[{order:1,line:'Я актёр. И ещё пишу музыку.',durationSec:2},{order:2,line:'И у нас есть проблема.',durationSec:2}],shots:[{order:1,durationSec:2},{order:2,durationSec:2}]});
 const exe=join(d,'whisper-stub.cjs');
 await writeFile(exe,`#!/usr/bin/env node
const fs=require('fs');const a=process.argv,p=a[a.indexOf('-of')+1];let words=p.includes('take0')?['Я','актёр','И','ещё','пишу','музыку']:['И','у','нас','есть','проблема'];fs.writeFileSync(p+'.json',JSON.stringify({transcription:words.map((text,i)=>({text,offsets:{from:i*280,to:(i+1)*280}}))}));
`);
 await chmod(exe,0o755);
 const model=join(d,'local-model.bin');await writeFile(model,Buffer.alloc(1024*1024+1));
 const renderer=join(d,'renderer.mjs');
 await writeFile(renderer,`import {spawnSync} from 'node:child_process';import {readFileSync} from 'node:fs';const input=JSON.parse(readFileSync(process.argv[2]));const r=spawnSync('ffmpeg',['-v','error','-i',input.clips[0].path,'-t','0.5','-c:v','libx264','-preset','ultrafast','-c:a','aac',process.argv[3]],{encoding:'utf8'});if(r.status)process.exit(1);`);
 const verifier=join(d,'qa.mjs');
 await writeFile(verifier,`import {statSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const path=resolve(process.argv[2]);
const evidence={path,fileExists:true,probeVerified:true,bytes:statSync(path).size,sha256:createHash('sha256').update(readFileSync(path)).digest('hex'),durationSec:0.5,width:1080,height:1920,fps:30,videoCodec:'h264',audioCodec:'aac',blackFrameCheckPassed:true,audioCheckPassed:true};
writeFileSync(process.argv[5],JSON.stringify({evidence,handoff:{passed:false,status:'blocked',errors:['author approval required'],assets:[{passed:true}]},distribution:null}));`);
 const result=await runFirstReel({sources,brief,outputDir:join(d,'finished'),whisperCli:exe,whisperModel:model,rendererPath:renderer,verifierPath:verifier});
 assert.equal(result.status,'awaiting-author-review');
 assert.equal(result.events.length,7);
 assert.ok(result.events.includes('reviewable_subtitle_sidecars_written'));
 assert.equal(result.subtitleDraft.status,'needs-human-review');
 assert.match(await readFile(result.subtitleDraft.srtPath,'utf8'),/Я актёр/);
 assert.equal(result.distributionAllowed,false);
 assert.ok((await stat(result.output)).size>1000);
 for(let i=0;i<videos.length;i++)assert.deepEqual(await readFile(videos[i]),originals[i]);
 await assert.rejects(()=>runFirstReel({sources,brief,outputDir:join(d,'finished'),whisperCli:exe,whisperModel:model,rendererPath:renderer,verifierPath:verifier}),/EEXIST/);
 }finally{await rm(d,{recursive:true,force:true})}
});

test('draft QA rejects a fake success, technical failure, and a missing publication blocker',()=>{
 const output=join(tmpdir(),'persona-draft-contract.mp4');
 const evidence={path:output,fileExists:true,probeVerified:true,bytes:1024,sha256:'a'.repeat(64),durationSec:3.7,width:1080,height:1920,fps:30,videoCodec:'h264',audioCodec:'aac',blackFrameCheckPassed:true,audioCheckPassed:true};
 const handoff={passed:false,status:'blocked',errors:['author approval required'],assets:[{passed:true}]};
 const safe={evidence,handoff,distribution:null};
 assert.equal(validateDraftQa(safe,output),true);
 assert.throws(()=>validateDraftQa({...safe,evidence:{...evidence,blackFrameCheckPassed:false}},output),/technical QA/);
 assert.throws(()=>validateDraftQa({...safe,evidence:{...evidence,fps:29.97}},output),/technical QA/);
 assert.throws(()=>validateDraftQa({...safe,evidence:{...evidence,path:join(tmpdir(),'different.mp4')}},output),/technical QA/);
 assert.throws(()=>validateDraftQa({...safe,handoff:{...handoff,errors:[]}},output),/publication handoff/);
 assert.throws(()=>validateDraftQa({...safe,handoff:{...handoff,passed:true,status:'approved_for_distribution'}},output),/publication handoff/);
 assert.throws(()=>validateDraftQa({...safe,distribution:{instagram:{status:'ready'}}},output),/publication handoff/);
});

test('unsafe or mismatched Whisper model / brief fail before creating output',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-preflight-'));
 try{
  const src=join(dir,'sources.json'),brief=join(dir,'brief.json'),model=join(dir,'ggml-base.bin'),out=join(dir,'out');
  await mk(src,{version:1,sources:[{id:'one',path:'not-actually-needed-yet.mp4'}]});
  await mk(brief,{version:1,sourceFormat:'reel',script:[{order:1,line:'Первая реплика'},{order:2,line:'Вторая реплика'}],shots:[{order:1},{order:2}]});
  const args={sources:src,brief,outputDir:out,whisperCli:process.execPath,whisperModel:model};
  await writeFile(model,Buffer.from('not a real model'));
  await assert.rejects(()=>runFirstReel(args),/too small/);
  await assert.rejects(()=>stat(out),/ENOENT/);
  const english=join(dir,'ggml-base.en.bin');
  await writeFile(english,Buffer.alloc(1024*1024+1));
  await assert.rejects(()=>runFirstReel({...args,whisperModel:english}),/English-only/);
  await mk(brief,{version:1,sourceFormat:'reel',script:[{order:1,line:'Only one line'}],shots:[{order:1}]});
  await assert.rejects(()=>runFirstReel({...args,whisperModel:english}),/English-only/);
  await writeFile(model,Buffer.alloc(1024*1024+1));
  await assert.rejects(()=>runFirstReel(args),/Invalid Persona Reel brief/);
  await assert.rejects(()=>stat(out),/ENOENT/);
 }finally{await rm(dir,{recursive:true,force:true})}
});

test('Whisper failure automatically produces playable Recovery Review and manual speech resumes real FFmpeg render',
 {skip:!mediaTools,timeout:240000},async()=>{
 const d=await mkdtemp(join(tmpdir(),'persona-recovery-handoff-'));
 try{
  const sourcePaths=[join(d,'actor.mp4'),join(d,'composer.mp4')],originals=[];
  for(let i=0;i<2;i++){
   const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error',
    '-f','lavfi','-i','color=c='+(i?'yellow':'cyan')+':s=240x320:r=30',
    '-f','lavfi','-i','sine=frequency='+(i?550:440)+':sample_rate=48000',
    '-t','2.8','-c:v','mpeg4','-c:a','aac','-shortest',sourcePaths[i]],
    {encoding:'utf8',timeout:30000});
   assert.equal(result.status,0,result.stderr);
   originals.push(await readFile(sourcePaths[i]));
  }
  const sources=join(d,'sources.json'),brief=join(d,'brief.json'),draft=join(d,'draft'),out=join(d,'reviewed');
  const script=['Я актёр. И ещё пишу музыку.','И у нас есть проблема.'];
  await mk(sources,{version:1,sources:sourcePaths.map((path,i)=>({id:'take'+i,path}))});
  await mk(brief,{version:1,sourceFormat:'reel',
   script:script.map((line,i)=>({order:i+1,line})),
   shots:script.map((_,i)=>({order:i+1,action:'Реплика'}))});
  const model=join(d,'ggml-small.bin');await writeFile(model,Buffer.alloc(1024*1024+1));
  const status=await runFirstReel({sources,brief,outputDir:draft,whisperCli:process.execPath,
   whisperModel:model,transcribeStep:async()=>{throw Error('Whisper did not return usable speech')}});
  assert.equal(status.status,'needs-manual-transcript-review');
  assert.equal(status.publicationApproved,false);
  assert.equal(status.distributionAllowed,false);
  assert.match(status.reason,/Whisper/);
  const kit=join(draft,'editorial-review-kit'),pack=JSON.parse(await readFile(join(kit,'candidate-pack.json'),'utf8'));
  assert.equal(pack.beats.length,2);
  assert.ok(pack.beats.every(x=>x.candidates.length===0&&x.recovery.availableSources.length===2));
  const page=await readFile(join(kit,'previews','review.html'),'utf8');
  assert.match(page,/Recovery Review/);
  assert.match(page,/source-take0-inspection.mp4/);
  assert.equal((await stat(join(kit,'previews','source-take0-inspection.mp4'))).size>1000,true);
  await assert.rejects(()=>stat(join(draft,'draft-reel.mp4')),/ENOENT/);
  const selectionPath=join(d,'selection.reviewed.json');
  await mk(selectionPath,{version:1,kind:'persona-editorial-selection-v1',status:'human-reviewed-not-published',
   selections:script.map((line,i)=>({
    beat:i+1,reviewed:true,candidateId:null,reason:'Посмотрел и прослушал этот дубль',
    recovery:{kind:'persona-manual-segment-v1',transcriptSource:'manual-review',
     sourceId:'take'+i,sourceSha256:pack.beats[i].recovery.availableSources[i].sourceSha256,
     startSec:0.2,durationSec:1.9,transcript:line,confirmed:true,
     reason:'Я лично слышу точную реплику'},rejected:[]
   }))});
  const reviewed=await renderReviewedReel({draftDir:draft,selectionPath,outputDir:out});
  assert.equal(reviewed.status,'awaiting-author-review');
  assert.equal(reviewed.recoveredFromAsr,true);
  assert.equal(reviewed.originalDraft,null);
  assert.equal(reviewed.publicationApproved,false);
  assert.equal(reviewed.distributionAllowed,false);
  assert.ok((await stat(reviewed.output)).size>1000);
  const recovered=JSON.parse(await readFile(reviewed.decisionsPath,'utf8'));
  assert.equal(recovered.mode,'strict');
  assert.equal(recovered.choices.length,2);
  assert.ok(recovered.choices.every(x=>x.transcriptSource==='manual-review'&&x.manualTranscriptReview===true));
  const review=JSON.parse(await readFile(reviewed.creativeReviewTemplate,'utf8'));
  assert.equal(review.status,'unreviewed');
  assert.ok(review.scenes.every(x=>x.selectedCandidateId.startsWith('manual:')));
  assert.equal(JSON.parse(await readFile(reviewed.qaPath,'utf8')).handoff.passed,false);
  for(let i=0;i<2;i++)assert.deepEqual(await readFile(sourcePaths[i]),originals[i]);
 }finally{await rm(d,{recursive:true,force:true})}
});
