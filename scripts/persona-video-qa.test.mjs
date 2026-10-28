import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {assessLocalPersonaVideo} from './persona-video-qa.mjs';

async function fixture(fn) {
  const dir=await mkdtemp(join(tmpdir(),'persona-gate-'));
  try{return await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}
}
function render(args) {
  const r=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-y',...args],
    {encoding:'utf8',timeout:70000});
  assert.equal(r.status,0,r.stderr);
}
test('Valid synthetic vertical render requires independent human review',
  {timeout:120000},()=>fixture(async dir=>{
    const file=join(dir,'reel.mp4');
    render(['-f','lavfi','-i','testsrc2=s=720x1280:r=30:d=3',
      '-f','lavfi','-i','sine=f=440:d=3','-shortest',
      '-c:v','libx264','-preset','ultrafast','-c:a','aac',file]);
    const result=await assessLocalPersonaVideo(file);
    assert.equal(result.qa.status,'review_required');
    assert.equal(result.publishAllowed,false);
    assert.deepEqual(result.qa.blockers,[]);
    assert.ok(result.qa.pending.some(x=>x.includes('Subtitle timing')));
    assert.ok(result.qa.pending.some(x=>x.includes('identity preservation')));
    assert.equal(result.evidence.captionsRequired,true);
  }));
test('Low resolution and missing sound fail even when human review is pending',
  {timeout:120000},()=>fixture(async dir=>{
    const file=join(dir,'small.mp4');
    render(['-f','lavfi','-i','testsrc2=s=320x568:r=30:d=3',
      '-c:v','libx264','-preset','ultrafast',file]);
    const result=await assessLocalPersonaVideo(file);
    assert.equal(result.qa.status,'fail');
    assert.equal(result.publishAllowed,false);
    assert.ok(result.qa.blockers.some(x=>x.includes('resolution')));
    assert.ok(result.qa.blockers.some(x=>x.includes('Audio track missing')));
  }));
