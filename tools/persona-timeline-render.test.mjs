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
    assert.ok(Math.abs(manifest.output.durationSec-2.4)<1.5);
    for(let i=0;i<3;i++)assert.deepEqual(await readFile(clips[i]),originals[i]);
    const repeat=call([project,output]);
    assert.notEqual(repeat.status,0);
    assert.match(repeat.stderr,/already exists/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
