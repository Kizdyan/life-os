import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,rm,stat,writeFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {verifyLocalPersonaRender} from './persona-verify-render.mjs';
import {preflightFinish,finishPersonaReel,validateReviewedSrt,validateMusicCue} from './persona-finish-reel.mjs';

const hash=x=>createHash('sha256').update(x).digest('hex');
const writeJson=(p,x)=>writeFile(p,JSON.stringify(x,null,2)+'\n');
test('reviewed SRT rejects overlap, ASS overrides and outside-video timestamps',()=>{
 const valid='1\n00:00:00,200 --> 00:00:01,100\nЯ актёр.\n\n2\n00:00:01,200 --> 00:00:02,100\nЯ музыкант.\n';
 assert.equal(validateReviewedSrt(valid,2.5).cueCount,2);
 assert.throws(()=>validateReviewedSrt(valid.replace('00:00:01,200','00:00:01,000'),2.5),/Overlapping/);
 assert.throws(()=>validateReviewedSrt(valid.replace('Я актёр.','{\\an8}Я актёр.'),2.5),/styled/);
 assert.throws(()=>validateReviewedSrt(valid,1.9),/out-of-video/);
});
test('music cue is mandatory, bounded and cannot silently become a full-length soundtrack',()=>{
 const options={startSec:0.85,endSec:1.85,volume:0.16,originalVolume:0.9};
 const cue=validateMusicCue(options,2.5,1.1);
 assert.equal(cue.durationSec,1);
 assert.equal(cue.fadeInSec,0.04);
 assert.equal(cue.fadeOutSec,0.18);
 assert.throws(()=>validateMusicCue({volume:0.16,originalVolume:0.9},2.5,3),/startSec/);
 assert.throws(()=>validateMusicCue({...options,endSec:2.8},2.5,3),/endSec/);
 assert.throws(()=>validateMusicCue({...options,endSec:0.7},2.5,3),/cue/);
 assert.throws(()=>validateMusicCue({...options,fadeInSec:0.6,fadeOutSec:0.6},2.5,3),/fades/);
 assert.throws(()=>validateMusicCue(options,2.5,0.4),/whole selected cue/);
});
function bandRms(path,startSec){
 const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-ss',String(startSec),
  '-t','0.25','-i',path,'-vn','-af','bandpass=f=560:w=25',
  '-ar','8000','-ac','1','-f','s16le','pipe:1'],
  {encoding:null,timeout:30000,maxBuffer:1_000_000});
 assert.equal(result.status,0,String(result.stderr));
 assert.ok(result.stdout.length>=1000,'audio sample was missing');
 let energy=0;
 for(let i=0;i+1<result.stdout.length;i+=2){const sample=result.stdout.readInt16LE(i);energy+=sample*sample}
 return Math.sqrt(energy/(result.stdout.length/2));
}
test('preflight rejects unapproved choices and never creates an output directory',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-finish-preflight-'));
 try{
  const input=join(root,'draft'),options=join(root,'options.json'),out=join(root,'new-result');
  await mkdir(input);
  await writeJson(options,{version:1,kind:'persona-finish-choices-v1',
   sourceSha256:'a'.repeat(64),publicationApproved:false,captionsReviewed:false,
   captionsPath:join(root,'captions.reviewed.srt')});
  await assert.rejects(()=>preflightFinish({draftDir:input,optionsPath:options,outputDir:out}),/reviewed captions/);
  await assert.rejects(()=>stat(out),/ENOENT/);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('reject symlinked output parents before writing anything',{skip:process.platform==='win32'},async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-finish-symlink-'));
 try{
  const draft=join(root,'draft'),link=join(root,'redirect');
  await mkdir(draft);await symlink(draft,link,'dir');
  await assert.rejects(()=>preflightFinish({
   draftDir:draft,optionsPath:join(root,'missing.json'),outputDir:join(link,'next')
  }),/outside the existing draft folder/);
  await assert.rejects(()=>stat(join(draft,'next')),/ENOENT/);
 }finally{await rm(root,{recursive:true,force:true})}
});
const media=['ffmpeg','ffprobe'].every(x=>spawnSync(x,['-version'],{encoding:'utf8'}).status===0);
const libass=media&&/subtitles\s+V->V/.test(spawnSync('ffmpeg',['-filters'],{encoding:'utf8'}).stdout||'');
const ffmpegBin=(()=>{const finder=process.platform==='win32'?'where.exe':'which',result=spawnSync(finder,['ffmpeg'],{encoding:'utf8'});
 return result.status===0?dirname(result.stdout.split(/\r?\n/).find(Boolean).trim()):null})();
test('real FFmpeg burned SRT + optional music + bounded grade -> new QA, original unchanged',
 {skip:!libass,timeout:240000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-finish-real-'));
 try{
  const draft=join(root,'draft'),output=join(root,'finished'),optionsPath=join(root,'finish-options.json');
  await mkdir(draft);
  const movie=join(draft,'draft-reel.mp4');
  const made=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi',
   '-i','color=c=gray:s=1080x1920:r=30','-f','lavfi','-i','sine=frequency=410:sample_rate=48000',
   '-t','2.5','-c:v','libx264','-preset','ultrafast','-c:a','aac','-shortest',movie],
   {encoding:'utf8',timeout:70000});
  assert.equal(made.status,0,made.stderr);
  const original=await readFile(movie);
  const qa=await verifyLocalPersonaRender({path:movie,contentId:'persona-finish-test',
   format:'reel',authorApproved:false,outputPath:join(draft,'qa.json')});
  assert.equal(qa.handoff.passed,false);
  await writeJson(join(draft,'RESULT.json'),{version:1,status:'awaiting-author-review',
   output:movie,qaPath:join(draft,'qa.json'),briefIdeaId:'test-idea',
   briefFingerprintSha256:'f'.repeat(64),distributionAllowed:false,
   events:['real_mp4_rendered','technical_qa_passed']});
  const captions=join(root,'captions.reviewed.srt');
  await writeFile(captions,'1\n00:00:00,200 --> 00:00:01,700\nЯ актёр. Я музыкант.\n');
  const music=join(root,'music.wav');
  const madeMusic=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i',
   'sine=frequency=560:sample_rate=48000','-t','3','-c:a','pcm_s16le',music],
   {encoding:'utf8',timeout:30000});
  assert.equal(madeMusic.status,0,madeMusic.stderr);
  const opts={version:1,kind:'persona-finish-choices-v1',publicationApproved:false,
   sourceSha256:qa.evidence.sha256,captionsReviewed:true,captionsPath:captions,
   color:{brightness:0.01,contrast:1.01,saturation:1.02},
   music:{path:music,volume:0.16,originalVolume:0.9,rightsConfirmed:true,
    startSec:0.85,endSec:1.85,fadeInSec:0.1,fadeOutSec:0.2}};
  await writeJson(optionsPath,opts);
  const pathKey=Object.keys(process.env).find(key=>key.toLowerCase()==='path')||'PATH',originalPath=process.env[pathKey];
  process.env[pathKey]='C:\\persona-no-ffmpeg-on-path';
  let res;
  try{res=await finishPersonaReel({draftDir:draft,optionsPath,outputDir:output,ffmpegDir:ffmpegBin});}
  finally{if(originalPath===undefined)delete process.env[pathKey];else process.env[pathKey]=originalPath}
  assert.equal(res.publicationApproved,false);
  assert.equal(res.distributionAllowed,false);
  assert.equal(res.captions.burnedIn,true);
  assert.equal(res.music.startSec,0.85);
  assert.equal(res.music.endSec,1.85);
  assert.equal(res.music.fadeOutSec,0.2);
  assert.ok(res.stages.includes('explicit-timed-licensed-music-with-fades-and-local-voice-ducking'));
  // A 560 Hz tone must appear only inside the author's cue, not everywhere.
  const before=bandRms(res.output,0.2),during=bandRms(res.output,1.05),after=bandRms(res.output,2.05);
  assert.ok(during>before*1.6,'Music was not audible inside selected cue');
  assert.ok(during>after*1.6,'Music leaked past selected cue');
  assert.ok(Math.abs(before-after)<Math.max(before,after)*0.3,
   'Voice should match before and after selected cue');
  assert.ok(res.stages.includes('real-ffmpeg-technical-qa-passed-no-publication'));
  assert.ok(res.stages.includes('local-video-quality-analysis-written'));
  assert.equal(res.publicationApproved,false);
  assert.ok((await stat(res.output)).size>1000);
  assert.deepEqual(await readFile(movie),original);
  assert.equal(hash(await readFile(movie)),qa.evidence.sha256);
  const finishedQa=JSON.parse(await readFile(res.qaPath,'utf8'));
  assert.equal(JSON.parse(await readFile(res.qualityPath,'utf8')).video.sha256,finishedQa.evidence.sha256);
  assert.equal(finishedQa.handoff.passed,false);
  assert.equal(finishedQa.handoff.errors[0],'author approval required');
  await assert.rejects(()=>finishPersonaReel({draftDir:draft,optionsPath,outputDir:output}),/already exists/);
  await writeJson(optionsPath.replace('.json','-bad.json'),{...opts,sourceSha256:'0'.repeat(64)});
  await assert.rejects(()=>preflightFinish({draftDir:draft,
   optionsPath:optionsPath.replace('.json','-bad.json'),outputDir:join(root,'bad-output')}),/changed or is not/);
  await assert.rejects(()=>stat(join(root,'bad-output')),/ENOENT/);
 }finally{await rm(root,{recursive:true,force:true})}
});
