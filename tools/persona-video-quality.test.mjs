import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {analyzePersonaVideoQuality} from './persona-video-quality.mjs';

const media=['ffmpeg','ffprobe'].every(bin=>spawnSync(bin,['-version'],{encoding:'utf8'}).status===0);
const ffmpegBin=(()=>{
 const finder=process.platform==='win32'?'where.exe':'which';
 const result=spawnSync(finder,['ffmpeg'],{encoding:'utf8'});
 return result.status===0?dirname(result.stdout.split(/\r?\n/).find(Boolean).trim()):null;
})();

test('real local MP4 quality report binds measured issues to SHA-256 and never approves art',
 {skip:!media,timeout:120000},async()=>{
  const root=await mkdtemp(join(tmpdir(),'persona-video-quality-'));
  try{
   const movie=join(root,'candidate.mp4'),srt=join(root,'captions.reviewed.srt'),reportPath=join(root,'video-quality.json'),timelinePath=join(root,'candidate.mp4.persona.json');
   const made=spawnSync('ffmpeg',['-hide_banner','-loglevel','error',
    '-f','lavfi','-i','color=c=black:s=1080x1920:r=30:d=0.4',
    '-f','lavfi','-i','color=c=red:s=1080x1920:r=30:d=1.6',
    '-f','lavfi','-i','sine=frequency=500:sample_rate=48000:duration=2',
    '-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[v]','-map','[v]','-map','2:a',
    '-c:v','libx264','-preset','ultrafast','-c:a','aac','-shortest',movie],{encoding:'utf8',timeout:60000});
   assert.equal(made.status,0,made.stderr);
   await writeFile(srt,'1\n00:00:00,100 --> 00:00:00,900\nКороткая реплика.\n\n2\n00:00:00,850 --> 00:00:01,700\nПересекающийся титр.\n');
   const movieSha=createHash('sha256').update(await readFile(movie)).digest('hex');
   await writeFile(timelinePath,JSON.stringify({version:1,operation:'timeline-render',output:{path:movie,durationSec:2,sha256:movieSha},outputTimeline:[
    {clipIndex:1,beat:1,sourceSha256:'a'.repeat(64),outputStartSec:0,outputEndSec:.4,durationSec:.4},{clipIndex:2,beat:2,sourceSha256:'b'.repeat(64),outputStartSec:.4,outputEndSec:2,durationSec:1.6}]}));
   const pathKey=Object.keys(process.env).find(key=>key.toLowerCase()==='path')||'PATH';
   const originalPath=process.env[pathKey];process.env[pathKey]='C:\\persona-no-ffmpeg-on-path';
   let quality;
   try{quality=await analyzePersonaVideoQuality({videoPath:movie,subtitlePath:srt,expectedDurationSec:2,outputPath:reportPath,ffmpegDir:ffmpegBin,timelinePath});}
   finally{if(originalPath===undefined)delete process.env[pathKey];else process.env[pathKey]=originalPath}
   assert.equal(quality.version,1);
   assert.match(quality.video.sha256,/^[a-f0-9]{64}$/);
   assert.equal(quality.authorApproval.publicationApproved,false);
   assert.equal(quality.video.width,1080);
   assert.equal(quality.video.height,1920);
   assert.equal(quality.findings.find(x=>x.id==='decode_integrity')?.status,'measured');
   assert.equal(quality.findings.find(x=>x.id==='frame_rate_mode')?.status,'measured');
   assert.match(quality.findings.find(x=>x.id==='frame_rate_mode')?.detail??'',/30\.000 fps/);
   assert.equal(quality.findings.find(x=>x.id==='rotation_metadata')?.measurement.rotationDegrees,0);
   assert.equal(quality.findings.find(x=>x.id==='hdr_transfer_risk')?.status,'not_measured');
   assert.ok(quality.findings.some(x=>x.id==='black_frames'&&x.status==='warning'));
   assert.ok(quality.findings.some(x=>x.id==='luma_jumps'&&x.status==='warning'));
   assert.ok(quality.findings.some(x=>x.id==='chroma_jumps'&&x.status==='warning'));
   const visual=quality.findings.find(x=>x.id==='visual_metrics');
   assert.equal(visual?.status,'measured');
   assert.equal(visual?.measurement.sampleRate,4);
   assert.ok(visual?.measurement.luma.mean>=0&&visual?.measurement.luma.mean<=255);
   assert.ok(visual?.measurement.luma.median>=0&&visual?.measurement.luma.median<=255);
   assert.ok(visual?.measurement.luma.shadowSamplePercent>0);
   assert.ok(visual?.measurement.color.uMean>=0&&visual?.measurement.color.uMean<=255);
   assert.ok(visual?.measurement.color.vMean>=0&&visual?.measurement.color.vMean<=255);
   assert.equal(quality.findings.find(x=>x.id==='scene_visual_metrics')?.measurement.scenes.length,2);
   const comparison=quality.findings.find(x=>x.id==='scene_color_comparisons');
   assert.equal(comparison?.status,'measured');
   assert.equal(comparison?.measurement.comparisons[0].classification,'not_comparable');
   assert.equal(quality.visualEvidence?.kind,'persona-visual-evidence-v1');
   assert.equal(quality.visualEvidence?.frames.length,2);
   assert.ok((await stat(quality.visualEvidence.contactSheetPath)).size>1000);
   await writeFile(timelinePath,JSON.stringify({version:1,operation:'timeline-render',output:{path:movie,durationSec:2,sha256:'0'.repeat(64)},outputTimeline:[
    {clipIndex:1,beat:1,outputStartSec:0,outputEndSec:1,durationSec:1},{clipIndex:2,beat:2,outputStartSec:1.2,outputEndSec:2,durationSec:.8}]}));
   const stale=await analyzePersonaVideoQuality({videoPath:movie,expectedDurationSec:2,ffmpegDir:ffmpegBin,timelinePath});
   assert.equal(stale.findings.find(x=>x.id==='scene_timeline')?.status,'not_measured');
   assert.ok(quality.findings.some(x=>x.id==='subtitle_overlap'&&x.status==='warning'));
   assert.ok(quality.findings.some(x=>x.id==='acting'&&x.status==='needs_human_review'));
   assert.deepEqual(JSON.parse(await readFile(reportPath,'utf8')),quality);
  }finally{await rm(root,{recursive:true,force:true})}
 });
