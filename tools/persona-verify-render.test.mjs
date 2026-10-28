import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {verifyLocalPersonaRender} from './persona-verify-render.mjs';
const available=['ffmpeg','ffprobe'].every(cmd=>spawnSync(cmd,['-version'],{stdio:'ignore'}).status===0);
test('local QA reads real rendered video and requires author approval', {skip:!available},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-verify-'));
 try{
  const file=join(dir,'sample.mp4');
  const ff=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=320x568:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','3','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',file],{timeout:30000,encoding:'utf8'});
  assert.equal(ff.status,0,ff.stderr);
  const blocked=await verifyLocalPersonaRender({path:file,contentId:'qa-test',format:'reel'});
  assert.equal(blocked.handoff.passed,false);
  assert.ok(blocked.handoff.errors.includes('author approval required'));
  assert.match(blocked.evidence.sha256,/^[a-f0-9]{64}$/);
  const approved=await verifyLocalPersonaRender({path:file,contentId:'qa-test',format:'reel',authorApproved:true});
  assert.equal(approved.handoff.passed,true,approved.handoff.errors.join('; '));
  assert.equal(approved.distribution.deliveries.length,4);
 }finally{await rm(dir,{recursive:true,force:true})}
});

test('QA rejects missing audio and fully black renders', {skip:!available},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-verify-negative-'));
 try{
  const silent=join(dir,'no-audio.mp4');
  const silentRender=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=320x568:rate=30','-t','3','-c:v','libx264','-pix_fmt','yuv420p',silent],{timeout:30000,encoding:'utf8'});
  assert.equal(silentRender.status,0,silentRender.stderr);
  const noAudio=await verifyLocalPersonaRender({path:silent,contentId:'no-audio',format:'reel',authorApproved:true});
  assert.equal(noAudio.handoff.passed,false);
  assert.ok(noAudio.handoff.errors.some(e=>e.includes('audio codec')||e.includes('audio check')));
  const black=join(dir,'black.mp4');
  const blackRender=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=black:s=320x568:r=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','3','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',black],{timeout:30000,encoding:'utf8'});
  assert.equal(blackRender.status,0,blackRender.stderr);
  const blackQa=await verifyLocalPersonaRender({path:black,contentId:'black',format:'reel',authorApproved:true});
  assert.equal(blackQa.handoff.passed,false);
  assert.ok(blackQa.handoff.errors.some(e=>e.includes('black frame')));
 }finally{await rm(dir,{recursive:true,force:true})}
});

test('three shots render into verified master, then await author approval', {skip:!available},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-end-to-end-'));
 try{
  const clips=[];
  for(let i=0;i<3;i++){
   const file=join(dir,'shot-'+i+'.mp4');
   const p=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=320x568:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','1.5','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',file],{timeout:30000,encoding:'utf8'});
   assert.equal(p.status,0,p.stderr);clips.push(file);
  }
  const project=join(dir,'timeline.json'),output=join(dir,'master.mp4');
  await writeFile(project,JSON.stringify({version:1,width:320,height:568,fps:30,clips:clips.map(path=>({path,startSec:0,durationSec:1.2}))}));
  const render=spawnSync(process.execPath,[resolve('tools/persona-timeline-render.mjs'),project,output],{timeout:120000,encoding:'utf8'});
  assert.equal(render.status,0,render.stderr);
  const manifest=JSON.parse(await readFile(output+'.persona.json','utf8'));
  assert.equal(manifest.verification.passed,true);
  const blocked=await verifyLocalPersonaRender({path:output,contentId:'demo-001',format:'reel'});
  assert.equal(blocked.handoff.passed,false);
  assert.equal(blocked.distribution,null);
  assert.equal(blocked.evidence.sha256,manifest.output.sha256);
  const approved=await verifyLocalPersonaRender({path:output,contentId:'demo-001',format:'reel',authorApproved:true});
  assert.equal(approved.handoff.passed,true,approved.handoff.errors.join('; '));
  assert.ok(approved.distribution.deliveries.every(d=>d.status==='awaiting_provider_check'));
 }finally{await rm(dir,{recursive:true,force:true})}
});
