import {test} from 'node:test';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,rm,stat} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {inspectTake,overlapsBlackInterval,parseTakeDiagnostics} from './persona-take-qa.mjs';
const available=spawnSync('ffmpeg',['-version'],{encoding:'utf8'}).status===0;
test('parse grounded metrics, not subjective acting scores',()=>{
 const r=parseTakeDiagnostics('lavfi.signalstats.YAVG=10\nlavfi.signalstats.SATAVG=22\nblack_start:0 black_end:1 black_duration:1','max_volume: -0.1 dB',2,true);
 assert.equal(r.meanLuma,10);assert.equal(r.audioPeakDb,-0.1);
 assert.deepEqual(r.warnings,['audio_near_digital_ceiling','black_video_intervals','low_average_luma_review']);
 assert.ok(!('actingScore' in r));
});
test('reject source slices that intersect black frame intervals',()=>{
 const intervals=[{startSec:1,endSec:2.5}];
 assert.equal(overlapsBlackInterval(.3,1.6,intervals),true);
 assert.equal(overlapsBlackInterval(2.6,3.4,intervals),false);
});
test('real FFmpeg detects black video and no audio, leaves the original intact',{skip:!available},async()=>{
 const d=await mkdtemp(join(tmpdir(),'persona-take-qa-'));
 try{
  const video=join(d,'black.mp4');
  const r=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=black:s=320x240:r=30','-t','2','-c:v','mpeg4',video],{encoding:'utf8',timeout:30000});
  assert.equal(r.status,0,r.stderr);
  const before=(await stat(video)).size;
  const report=await inspectTake({path:video,durationSec:2,hasAudio:false});
  assert.ok(report.warnings.includes('audio_track_missing'));
  assert.ok(report.warnings.includes('black_video_intervals'));
  assert.equal((await stat(video)).size,before);
 }finally{await rm(d,{recursive:true,force:true})}
});