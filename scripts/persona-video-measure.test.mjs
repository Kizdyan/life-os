import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {measurePersonaVideo} from './persona-video-measure.mjs';

const render=args=>{
  const r=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-y',...args],
    {encoding:'utf8',timeout:70000});
  assert.equal(r.status,0,r.stderr);
};
async function fixture(fn) {
  const dir=await mkdtemp(join(tmpdir(),'persona-qa-'));
  try{return await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}
}
test('Measures real moving video, actual sound and SHA-256 without modifying input',
  {timeout:110000},()=>fixture(async dir=>{
    const file=join(dir,'moving.mp4');
    render(['-f','lavfi','-i','testsrc2=s=320x568:r=30:d=3',
      '-f','lavfi','-i','sine=f=440:d=3','-shortest',
      '-c:v','libx264','-preset','ultrafast','-c:a','aac',file]);
    const before=await readFile(file);
    const report=await measurePersonaVideo(file);
    assert.equal(report.evidence.width,320);
    assert.equal(report.evidence.height,568);
    assert.equal(report.evidence.fps,30);
    assert.ok(report.evidence.durationSeconds>=3);
    assert.equal(report.evidence.hasAudio,true);
    assert.ok(Number.isFinite(report.evidence.integratedLufs));
    assert.ok(Number.isFinite(report.evidence.truePeakDbfs));
    assert.equal(report.evidence.blackOrFrozenFrames,0);
    assert.match(report.evidence.outputSha256,/^[a-f0-9]{64}$/);
    assert.equal(report.evidence.identityPreserved,null);
    assert.equal(report.evidence.visibleArtifacts,null);
    assert.deepEqual(await readFile(file),before);
  }));
test('Detects black or frozen static frames without guessing identity and rights',
  {timeout:110000},()=>fixture(async dir=>{
    const file=join(dir,'black.mp4');
    render(['-f','lavfi','-i','color=c=black:s=320x568:r=30:d=3',
      '-c:v','libx264','-preset','ultrafast',file]);
    const report=await measurePersonaVideo(file);
    assert.ok(report.evidence.blackOrFrozenFrames>=60,JSON.stringify(report.evidence));
    assert.equal(report.evidence.hasAudio,false);
    assert.equal(report.evidence.integratedLufs,null);
    assert.equal(report.evidence.mediaRightsCleared,null);
  }));
test('Rejects damaged media rather than inventing measurements',
  {timeout:110000},()=>fixture(async dir=>{
    const file=join(dir,'invalid.mp4');
    await writeFile(file,Buffer.from('not an mp4'));
    await assert.rejects(()=>measurePersonaVideo(file));
  }));
