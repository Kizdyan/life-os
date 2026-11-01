import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {analyzePersonaVideoQuality} from './persona-video-quality.mjs';

const media=['ffmpeg','ffprobe'].every(bin=>spawnSync(bin,['-version'],{encoding:'utf8'}).status===0);

test('real local MP4 quality report binds measured issues to SHA-256 and never approves art',
 {skip:!media,timeout:120000},async()=>{
  const root=await mkdtemp(join(tmpdir(),'persona-video-quality-'));
  try{
   const movie=join(root,'candidate.mp4'),srt=join(root,'captions.reviewed.srt'),reportPath=join(root,'video-quality.json');
   const made=spawnSync('ffmpeg',['-hide_banner','-loglevel','error',
    '-f','lavfi','-i','color=c=black:s=1080x1920:r=30:d=0.4',
    '-f','lavfi','-i','color=c=red:s=1080x1920:r=30:d=1.6',
    '-f','lavfi','-i','sine=frequency=500:sample_rate=48000:duration=2',
    '-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[v]','-map','[v]','-map','2:a',
    '-c:v','libx264','-preset','ultrafast','-c:a','aac','-shortest',movie],{encoding:'utf8',timeout:60000});
   assert.equal(made.status,0,made.stderr);
   await writeFile(srt,'1\n00:00:00,100 --> 00:00:00,900\nКороткая реплика.\n\n2\n00:00:00,850 --> 00:00:01,700\nПересекающийся титр.\n');
   const quality=await analyzePersonaVideoQuality({videoPath:movie,subtitlePath:srt,expectedDurationSec:2,outputPath:reportPath});
   assert.equal(quality.version,1);
   assert.match(quality.video.sha256,/^[a-f0-9]{64}$/);
   assert.equal(quality.authorApproval.publicationApproved,false);
   assert.equal(quality.video.width,1080);
   assert.equal(quality.video.height,1920);
   assert.ok(quality.findings.some(x=>x.id==='black_frames'&&x.status==='warning'));
   assert.ok(quality.findings.some(x=>x.id==='luma_jumps'&&x.status==='warning'));
   assert.ok(quality.findings.some(x=>x.id==='chroma_jumps'&&x.status==='warning'));
   assert.ok(quality.findings.some(x=>x.id==='subtitle_overlap'&&x.status==='warning'));
   assert.ok(quality.findings.some(x=>x.id==='acting'&&x.status==='needs_human_review'));
   assert.deepEqual(JSON.parse(await readFile(reportPath,'utf8')),quality);
  }finally{await rm(root,{recursive:true,force:true})}
 });
