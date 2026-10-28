import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {renderSyntheticPilot} from './persona-synthetic-video-pilot.mjs';
import {assessPersonaReelExport} from '../packages/core/src/media-export-qa.ts';

test('offline FFmpeg pilot emits measurable 9:16 media, never silent approval', {timeout:120000}, async()=>{
  const dir=await mkdtemp(join(tmpdir(),'persona-pilot-'));
  try {
    const file=join(dir,'synthetic.mp4');
    const report=await renderSyntheticPilot(file);
    const saved=JSON.parse(await readFile(file+'.qa.json','utf8'));
    assert.equal(report.notRemotion,true);
    assert.equal(report.evidence.width,720);
    assert.equal(report.evidence.height,1280);
    assert.equal(report.evidence.fps,30);
    assert.equal(report.evidence.durationSeconds,4);
    assert.match(report.evidence.outputSha256,/^[a-f0-9]{64}$/);
    assert.equal(saved.evidence.outputSha256,report.evidence.outputSha256);
    assert.ok(report.evidence.integratedLufs>=-22&&report.evidence.integratedLufs<=-10);
    assert.ok(report.evidence.truePeakDbfs<=-1);
    const qa=assessPersonaReelExport(report.evidence);
    assert.equal(qa.status,'review_required');
    assert.equal(qa.verified,false);
    assert.ok(qa.pending.some(x=>x.includes('identity preservation')));
    await assert.rejects(()=>renderSyntheticPilot(file),/already exists|exiting|failed/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
