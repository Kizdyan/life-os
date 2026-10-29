import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const engine = resolve('tools/persona-timeline-render.mjs');
const available = ['ffmpeg','ffprobe'].every(command => spawnSync(command,['-version'],{encoding:'utf8'}).status===0);
function call(args) { return spawnSync(process.execPath,[engine,...args],{encoding:'utf8',timeout:120000}); }
test('rejects missing timeline inputs',()=>{
  const result=call([]);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/Usage/);
});
test('rejects null project JSON',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-invalid-json-'));
 try{
  const project=join(dir,'null.json');
  await writeFile(project,'null');
  const result=call([project,join(dir,'out.mp4')]);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/Expected 2/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('rejects array project JSON',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-invalid-array-'));
 try{
  const project=join(dir,'array.json');
  await writeFile(project,'[]');
  const result=call([project,join(dir,'out.mp4')]);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/Expected 2/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('renders three real clips, inserts silent audio, preserves originals and writes manifest',{skip:!available},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'persona-multiclip-'));
  try {
    const clips=[];
    for(let i=0;i<3;i++){
      const path=join(dir,'clip '+i+'.mp4');
      const command=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=320x240:rate=25','-t','1','-c:v','mpeg4',path],{encoding:'utf8',timeout:30000});
      assert.equal(command.status,0,command.stderr);
      clips.push(path);
    }
    const originals=await Promise.all(clips.map(path=>readFile(path)));
    const project=join(dir,'project.json'),output=join(dir,'export.mp4');
    await writeFile(project,JSON.stringify({version:1,width:320,height:240,fps:25,clips:clips.map(path=>({path,startSec:0,durationSec:0.8}))}));
    const result=call([project,output]);
    assert.equal(result.status,0,result.stderr);
    assert.ok((await stat(output)).size>0);
    const manifest=JSON.parse(await readFile(output+'.persona.json','utf8'));
    assert.equal(manifest.clips.length,3);
    assert.equal(manifest.verification.passed,true);
    assert.equal(manifest.output.audio,true);
    assert.equal(manifest.output.width,320);
    assert.equal(manifest.output.height,240);
    assert.ok(Math.abs(manifest.output.durationSec-2.4)<1.5);
    for(let i=0;i<3;i++)assert.deepEqual(await readFile(clips[i]),originals[i]);
    const repeat=call([project,output]);
    assert.notEqual(repeat.status,0);
    assert.match(repeat.stderr,/already exists/);
    const invalidProject=join(dir,'invalid.json');
    await writeFile(invalidProject,JSON.stringify({version:1,width:320,height:240,fps:25,clips:[{path:clips[0],startSec:2,durationSec:1},{path:clips[1],startSec:0,durationSec:0.8}]}));
    const invalid=call([invalidProject,join(dir,'invalid.mp4')]);
    assert.notEqual(invalid.status,0);
    assert.match(invalid.stderr,/Invalid startSec/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('levels different source loudness safely and records measured before/after values',{skip:!available},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-audio-leveling-'));
 try{
  const sources=[join(dir,'a.mp4'),join(dir,'b.mp4')];
  for(const [index,path] of sources.entries()){
   const made=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c='+(index?'blue':'red')+':s=240x320:r=30','-f','lavfi','-i','sine=frequency='+(index?640:440)+':sample_rate=48000','-t','3','-vf','format=yuv420p','-af','volume='+(index?'-6dB':'0dB'),'-c:v','mpeg4','-c:a','aac','-shortest',path],{encoding:'utf8',timeout:30000});
   assert.equal(made.status,0,made.stderr);
  }
  const originals=await Promise.all(sources.map(path=>readFile(path)));
  const project=join(dir,'project.json'),output=join(dir,'leveled.mp4');
  await writeFile(project,JSON.stringify({version:1,width:240,height:320,fps:30,clips:sources.map(path=>({path,startSec:0,durationSec:2.5}))}));
  const rendered=call([project,output]);
  assert.equal(rendered.status,0,rendered.stderr);
  const manifest=JSON.parse(await readFile(output+'.persona.json','utf8'));
  assert.equal(manifest.output.audio,true);
  assert.equal(manifest.settings.fps,30);
  assert.equal(manifest.audioLeveling.strategy,'per-clip-integrated-loudness-gain-capped');
  const [loud,quiet]=manifest.audioLeveling.clips;
  assert.ok(loud.beforeLufs-quiet.beforeLufs>5,'fixture must begin with materially unequal loudness');
  assert.ok(Math.abs(loud.afterLufs-quiet.afterLufs)<2,'rendered clips should be levelled close enough for a cut');
  assert.ok(manifest.audioLeveling.clips.every(clip=>clip.afterTruePeakDb<=-0.5),'leveling must leave peak headroom');
  for(const [index,path] of sources.entries())assert.deepEqual(await readFile(path),originals[index]);
 }finally{await rm(dir,{recursive:true,force:true})}
});
