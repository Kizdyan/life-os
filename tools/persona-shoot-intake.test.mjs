import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseShootInputs, buildFolderShootManifest, createIntakeReport, formatIntakeMarkdown, runShootIntake } from './persona-shoot-intake.mjs';

const mediaTools=['ffmpeg','ffprobe'].every(bin=>
 spawnSync(bin,['-version'],{encoding:'utf8'}).status===0);

test('only explicit A01/B01 selected sources, up to six takes per scene',()=>{
 const manifest=parseShootInputs(['A01=a.MOV','B01=b.mp4','A01=c.m4v']);
 assert.deepEqual(manifest.sources.map(s=>s.id),['A01_take01','B01_take01','A01_take02']);
 assert.throws(()=>parseShootInputs(['A01=a.mp4','A01=b.mp4']),/at least one A01 and one B01/i);
 assert.throws(()=>parseShootInputs(['A01=a.mp4','B01=a.mp4']),/must not be assigned twice/);
 assert.throws(()=>parseShootInputs(['A01=a.wav','B01=b.mp4']),/Only video/);
 assert.throws(()=>parseShootInputs(['C01=c.mp4','B01=b.mp4']),/Expected A01/);
 assert.throws(()=>parseShootInputs(['A01=a.mp4','B01=b.mp4',...Array.from({length:6},(_,i)=>'A01=x'+i+'.mp4')]),/At most six/);
});

test('intake report cannot automatically approve color, performance or distribution',()=>{
 const source={id:'A01_take01',path:'/not-private/actor.mp4',bytes:1200,sha256:'a'.repeat(64),
  durationSec:4,width:1920,height:1080,hasAudio:true,
  frames:[{timeSec:2,path:'example.jpg'}],
  technicalQuality:{meanLuma:30,blackIntervals:[],audioPeakDb:-43,
   warnings:['low_average_luma_review','audio_very_low_peak_review']}};
 const r=createIntakeReport({kind:'persona-evidence-v1',sources:[source]},'sources.json');
 assert.equal(r.status,'needs-human-review');
 assert.equal(r.takes[0].assessment,'technical_warnings_require_review');
 assert.ok(r.takes[0].warnings.includes('coded_orientation_review_phone_rotation_possible'));
 assert.ok(r.takes[0].warnings.includes('audio_very_low_peak_review'));
 assert.ok(!('qualityScore' in r)&&!('actingScore' in r)&&!('approved' in r));
 assert.match(r.notes.join(' '),/eyes, glasses, skin, acting/);
 const markdown=formatIntakeMarkdown(r);
 assert.match(markdown,/приёмка съёмки A01\/B01/);
 assert.match(markdown,/Очень тихий звук/);
 assert.match(markdown,/просмотр автором/);
});

test('one explicitly selected folder maps seven conventional takes or two clearly named role recordings',async()=>{
 const d=await mkdtemp(join(tmpdir(),'persona-folder-intake-'));
 try{
  for(const name of ['A01_actor_hook_take01.mp4','B01_composer_problem_take01.mp4','A02_actor_audition_take01.mp4','B02_composer_deadline_take01.mp4','A03_actor_sleep_take01.mp4','B03_composer_lullaby_take01.mp4','A04_actor_payoff_take01.mp4'])await writeFile(join(d,name),'not-a-video');
  const seven=await buildFolderShootManifest(d);
  assert.equal(seven.mode,'seven_named_takes');
  assert.deepEqual(seven.manifest.sources.map(source=>source.id),['A01_take01','B01_take01','A02_take01','B02_take01','A03_take01','B03_take01','A04_take01']);
  await rm(d,{recursive:true,force:true});
  const roles=await mkdtemp(join(tmpdir(),'persona-folder-roles-'));
  await writeFile(join(roles,'actor_long_take.mp4'),'not-a-video');await writeFile(join(roles,'composer_long_take.mp4'),'not-a-video');
  const two=await buildFolderShootManifest(roles);
  assert.equal(two.mode,'role_long_takes_needs_review');
  assert.deepEqual(two.manifest.sources.map(source=>source.id),['actor_take01','composer_take01']);
  await assert.rejects(()=>buildFolderShootManifest(d),/ENOENT/);
  await rm(roles,{recursive:true,force:true});
 }finally{await rm(d,{recursive:true,force:true})}
});

test('two real FFmpeg takes -> local evidence, hash, previews, WAV and intake report; no source edits',{skip:!mediaTools,timeout:180000},async()=>{
 const d=await mkdtemp(join(tmpdir(),'persona-shoot-intake-'));
 try{
  const a=join(d,'a.mp4'),b=join(d,'b.mp4');
  const commands=[
   ['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=white:s=240x320:r=30',
    '-f','lavfi','-i','sine=frequency=400:sample_rate=16000','-t','3.2','-c:v','mpeg4','-c:a','aac','-shortest',a],
   ['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=black:s=320x240:r=30',
    '-t','3.2','-c:v','mpeg4',b]
  ];
  for(const args of commands){
   const p=spawnSync('ffmpeg',args,{encoding:'utf8',timeout:30000});
   assert.equal(p.status,0,p.stderr);
  }
  const originals=await Promise.all([readFile(a),readFile(b)]);
  const result=await runShootIntake({outputDir:join(d,'intake'),
   labeledFiles:['A01='+a,'B01='+b]});
  assert.equal(result.sourceCount,2);
  assert.equal(result.status,'needs-human-review');
  const report=JSON.parse(await readFile(result.reportPath,'utf8'));
  const manifest=JSON.parse(await readFile(result.manifestPath,'utf8'));
  const analysis=JSON.parse(await readFile(result.evidencePath,'utf8'));
  assert.equal(report.sourceCount,2);
  const summary=await readFile(result.summaryPath,'utf8');
  assert.match(summary,/A01_take01/);
  assert.match(summary,/B01_take01/);
  assert.match(summary,/Нет аудиодорожки/);
  assert.deepEqual(manifest.sources.map(x=>x.id),['A01_take01','B01_take01']);
  assert.deepEqual(report.takes.map(x=>x.sha256),analysis.sources.map(x=>x.sha256));
  assert.ok(report.takes[1].warnings.includes('cannot_transcribe_without_audio'));
  assert.ok(report.takes[1].warnings.includes('black_video_intervals'));
  assert.equal(report.takes[1].assessment,'technical_warnings_require_review');
  assert.ok((await stat(analysis.sources[0].audioPath)).size>0);
  for(const s of analysis.sources){
   assert.equal(s.frames.length,3);
   for(const f of s.frames)assert.ok((await stat(f.path)).size>0);
  }
  assert.deepEqual(await readFile(a),originals[0]);
  assert.deepEqual(await readFile(b),originals[1]);
  await assert.rejects(()=>runShootIntake({outputDir:join(d,'intake'),
   labeledFiles:['A01='+a,'B01='+b]}),/EEXIST/);
 }finally{await rm(d,{recursive:true,force:true})}
});
