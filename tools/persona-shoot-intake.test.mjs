import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import {fileURLToPath} from 'node:url';
import { parseShootInputs, buildFolderShootManifest, createIntakeReport, formatIntakeMarkdown, runShootIntake, runFolderShootIntake } from './persona-shoot-intake.mjs';

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

test('21 takes: folder intake sends only 7 UNREVIEWED defaults, retains 14 alternatives',async()=>{
 const d=await mkdtemp(join(tmpdir(),'persona-21-takes-'));
 try{
  const names=['A01_actor_hook','B01_composer_problem','A02_actor_audition',
   'B02_composer_deadline','A03_actor_sleep','B03_composer_lullaby','A04_actor_payoff'];
  for(const name of names){
   for(const n of ['01','02','03'])await writeFile(join(d,name+'_take'+n+'.mp4'),'untouched original placeholder');
  }
  await writeFile(join(d,'notes.txt'),'not an intake input');
  const result=await buildFolderShootManifest(d);
  assert.equal(result.mode,'seven_named_takes');
  assert.equal(result.manifest.sources.length,7,'Media Engine cannot accept 21 inputs');
  assert.deepEqual(result.manifest.sources.map(x=>x.id),[
   'A01_take01','B01_take01','A02_take01','B02_take01',
   'A03_take01','B03_take01','A04_take01'
  ]);
  assert.equal(result.alternateTakes.length,14);
  assert.ok(result.alternateTakes.some(t=>t.id==='A01_take02'));
  assert.ok(result.notes.join(' ').includes('UNREVIEWED'));
  assert.equal((await readFile(join(d,'A01_actor_hook_take02.mp4'),'utf8')),
   'untouched original placeholder');
 }finally{await rm(d,{recursive:true,force:true})}
});
test('explicit invalid FFmpeg bin fails before creating an output directory',async()=>{
 const d=await mkdtemp(join(tmpdir(),'persona-invalid-bin-'));
 try{
  const folder=join(d,'selected');
  await mkdir(folder);
  for(const role of ['actor','composer'])
   await writeFile(join(folder,role+'_long.mp4'),'not a video');
  const out=join(d,'not-created');
  await assert.rejects(()=>runFolderShootIntake({outputDir:out,folderPath:folder,ffmpegDir:d}),
   /Missing ffmpeg|Missing ffprobe/);
  await assert.rejects(stat(out),/ENOENT/);
 }finally{await rm(d,{recursive:true,force:true})}
});
test('folder intake refuses output inside author source folder before writing any file',async()=>{
 const d=await mkdtemp(join(tmpdir(),'persona-intake-nested-'));
 try{
  for(const name of ['A01_actor_hook','B01_composer_problem','A02_actor_audition',
   'B02_composer_deadline','A03_actor_sleep','B03_composer_lullaby','A04_actor_payoff'])
   await writeFile(join(d,name+'_take01.mp4'),'untouched original');
  const out=join(d,'inadvertent-output');
  await assert.rejects(()=>runFolderShootIntake({outputDir:out,folderPath:d}),
   /outside the selected source folder/);
  await assert.rejects(stat(out),/ENOENT/);
 }finally{await rm(d,{recursive:true,force:true})}
});
test('Windows-style isolated FFmpeg bin: folder intake works when PATH contains no media tools',
 {skip:!mediaTools||process.platform==='win32',timeout:180000},async()=>{
 const d=await mkdtemp(join(tmpdir(),'persona-intake-explicit-ffmpeg-'));
 try{
  const source=join(d,'selected'),bin=join(d,'isolated-bin'),out=join(d,'new-intake');
  await mkdir(source);await mkdir(bin);
  for(const [index,role]of ['actor','composer'].entries()){
   const media=join(source,role+'_long.mp4');
   const make=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi',
    '-i',index?'color=c=white:s=240x320:r=30':'color=c=gray:s=240x320:r=30',
    '-f','lavfi','-i','sine=frequency=430:sample_rate=16000',
    '-t','1.5','-c:v','mpeg4','-c:a','aac','-shortest',media],
    {encoding:'utf8',timeout:30000});
   assert.equal(make.status,0,make.stderr);
  }
  const ffmpegBinary=spawnSync('which',['ffmpeg'],{encoding:'utf8'}).stdout.trim();
  const ffprobeBinary=spawnSync('which',['ffprobe'],{encoding:'utf8'}).stdout.trim();
  assert.ok(ffmpegBinary&&ffprobeBinary);
  await symlink(ffmpegBinary,join(bin,'ffmpeg'));
  await symlink(ffprobeBinary,join(bin,'ffprobe'));
  const childEnv={...process.env,PATH:''};
  delete childEnv.PERSONA_FFMPEG;delete childEnv.PERSONA_FFPROBE;
  const cli=fileURLToPath(new URL('./persona-shoot-intake.mjs',import.meta.url));
  const child=spawnSync(process.execPath,[cli,'folder',out,source,bin],
   {env:childEnv,encoding:'utf8',timeout:90000,maxBuffer:1024*1024});
  assert.equal(child.status,0,child.stderr+'\n'+child.stdout);
  const report=JSON.parse(await readFile(join(out,'INTAKE.json'),'utf8'));
  assert.equal(report.sourceCount,2);
  assert.equal(report.status,'needs-human-review');
  assert.equal(report.folderMode,'role_long_takes_needs_review');
  assert.equal(report.briefPath,null,'intake must not claim an unapproved script');
  assert.deepEqual(report.alternateTakes,[]);
  assert.ok((await stat(join(out,'evidence','analysis.json'))).size>0);
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
