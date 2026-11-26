import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {summarizeSceneCandidates,detectReferenceCuts,indexReferenceVideos} from './persona-reference-video.mjs';
import {FOLDERS} from './persona-yandex-library.mjs';
test('cut statistics use candidate times and distinguish heuristic from confirmed montage',()=>{
 const r=summarizeSceneCandidates([4,1,1.1,0,9.9,NaN],10);
 assert.deepEqual(r.candidateCuts,[1,4]);assert.equal(r.meanShotSec,3.333);assert.equal(r.medianShotSec,3);
 assert.equal(r.cutsPerMinute,12);assert.equal(r.openingCuts,1);assert.equal(r.confidence,'heuristic');
 assert.throws(()=>summarizeSceneCandidates([],901));
});
test('reference video index resumes without changing original files',async()=>{
 const cache=await mkdtemp(join(tmpdir(),'persona-reference-video-'));
 try{
  const dir=join(cache,'catalogs',FOLDERS[1]),root=join(cache,'sources',FOLDERS[1]);await mkdir(dir,{recursive:true});await mkdir(root,{recursive:true});
  const sourcePath=join(root,'clip.mp4'),bytes=Buffer.from('fixture source'),sha256=createHash('sha256').update(bytes).digest('hex');
  await writeFile(sourcePath,bytes);await writeFile(join(dir,'persona-assets-v1.json'),JSON.stringify({kind:'persona-local-library-v1',assets:[{availability:'local',kind:'video',sourcePath,sha256,metadata:{durationSec:4}}]}));
  let calls=0;const analyze=async()=>{calls++;return {version:'reference-video-v1',assetSha256:sha256,status:'PARTIAL',speech:{status:'NOT_CONFIGURED'}}};
  const first=await indexReferenceVideos({cache,analyze});assert.equal(first.analyzed,1);
  const next=await indexReferenceVideos({cache,analyze});assert.equal(next.reused,1);assert.equal(calls,1);
  assert.deepEqual(await readFile(sourcePath),bytes);
 }finally{await rm(cache,{recursive:true,force:true})}
});
test('real FFmpeg detects a synthetic hard cut',{skip:spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status!==0},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-cut-'));
 try{
  const path=join(dir,'cut.mp4');
  const p=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=black:s=320x240:r=25:d=2','-f','lavfi','-i','color=c=white:s=320x240:r=25:d=2','-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0','-c:v','libx264','-pix_fmt','yuv420p',path],{encoding:'utf8'});
  assert.equal(p.status,0,p.stderr);
  const r=await detectReferenceCuts(path,4);assert.ok(r.candidateCuts.some(t=>Math.abs(t-2)<.15),JSON.stringify(r));
 }finally{await rm(dir,{recursive:true,force:true})}
});
