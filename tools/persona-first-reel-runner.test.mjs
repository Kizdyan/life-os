import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, stat, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runFirstReel } from './persona-first-reel-runner.mjs';
const mediaTools=['ffmpeg','ffprobe'].every(bin=>spawnSync(bin,['-version'],{encoding:'utf8'}).status===0);
const mk=(p,x)=>writeFile(p,JSON.stringify(x));
test('missing inputs fail preflight without creating output directory',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-runner-preflight-'));
 try{await assert.rejects(()=>runFirstReel({sources:join(dir,'missing.json'),brief:join(dir,'no.json'),outputDir:join(dir,'output'),whisperCli:'no',whisperModel:'no'}),/Missing required local file/);
 await assert.rejects(()=>stat(join(dir,'output')),/ENOENT/);
 }finally{await rm(dir,{recursive:true,force:true})}
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
 await writeFile(verifier,`import {writeFileSync} from 'node:fs';writeFileSync(process.argv[5],JSON.stringify({evidence:{synthetic:true,checks:true},handoff:{errors:['author approval required']}}));`);
 const result=await runFirstReel({sources,brief,outputDir:join(d,'finished'),whisperCli:exe,whisperModel:model,rendererPath:renderer,verifierPath:verifier});
 assert.equal(result.status,'awaiting-author-review');
 assert.equal(result.events.length,6);
 assert.equal(result.distributionAllowed,false);
 assert.ok((await stat(result.output)).size>1000);
 for(let i=0;i<videos.length;i++)assert.deepEqual(await readFile(videos[i]),originals[i]);
 await assert.rejects(()=>runFirstReel({sources,brief,outputDir:join(d,'finished'),whisperCli:exe,whisperModel:model,rendererPath:renderer,verifierPath:verifier}),/EEXIST/);
 }finally{await rm(d,{recursive:true,force:true})}
});
