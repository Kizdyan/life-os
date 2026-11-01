import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,rm,stat,writeFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyLocalPersonaRender} from './persona-verify-render.mjs';
import {preflightFinish,finishPersonaReel,validateReviewedSrt} from './persona-finish-reel.mjs';

const hash=x=>createHash('sha256').update(x).digest('hex');
const writeJson=(p,x)=>writeFile(p,JSON.stringify(x,null,2)+'\n');
test('reviewed SRT rejects overlap, ASS overrides and outside-video timestamps',()=>{
 const valid='1\n00:00:00,200 --> 00:00:01,100\nЯ актёр.\n\n2\n00:00:01,200 --> 00:00:02,100\nЯ музыкант.\n';
 assert.equal(validateReviewedSrt(valid,2.5).cueCount,2);
 assert.throws(()=>validateReviewedSrt(valid.replace('00:00:01,200','00:00:01,000'),2.5),/Overlapping/);
 assert.throws(()=>validateReviewedSrt(valid.replace('Я актёр.','{\\an8}Я актёр.'),2.5),/styled/);
 assert.throws(()=>validateReviewedSrt(valid,1.9),/out-of-video/);
});
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
   music:{path:music,volume:0.16,originalVolume:0.9,rightsConfirmed:true}};
  await writeJson(optionsPath,opts);
  const res=await finishPersonaReel({draftDir:draft,optionsPath,outputDir:output});
  assert.equal(res.publicationApproved,false);
  assert.equal(res.distributionAllowed,false);
  assert.equal(res.captions.burnedIn,true);
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
