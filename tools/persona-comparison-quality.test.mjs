import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {appendFile,mkdtemp,readFile,readdir,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createColorVariants} from './persona-color-variants.mjs';
import {inspectPersonaComparisonPackage} from './persona-comparison-quality.mjs';
import {createPersonaReviewPackage,renderPersonaReviewHtml} from './persona-comparison-review.mjs';

const media=['ffmpeg','ffprobe'].every(bin=>spawnSync(bin,['-version'],{encoding:'utf8'}).status===0);
const digest=buffer=>createHash('sha256').update(buffer).digest('hex');

test('comparison QC inspects real four-file FFmpeg render, writes paired frames and never approves art',
 {skip:!media,timeout:180000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-comparison-quality-'));
 try{
  const source=join(root,'source.mp4'),folder=join(root,'comparison'),reportPath=join(root,'comparison-qc.json');
  const generate=spawnSync('ffmpeg',['-hide_banner','-loglevel','error',
   '-f','lavfi','-i','testsrc2=size=160x284:rate=24:duration=1.5',
   '-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=1.5',
   '-map','0:v','-map','1:a','-c:v','libx264','-preset','ultrafast','-crf','28',
   '-pix_fmt','yuv420p','-c:a','aac','-shortest',source],{encoding:'utf8',timeout:60000});
  assert.equal(generate.status,0,generate.stderr);
  const before=digest(await readFile(source));
  const packageInfo=await createColorVariants({inputPath:source,outputDir:folder});
  assert.equal(packageInfo.variants.length,3);
  const qc=await inspectPersonaComparisonPackage({comparisonDir:folder,outputPath:reportPath});
  assert.equal(qc.kind,'persona-comparison-quality-v1');
  assert.equal(qc.sourceSha256,before);
  assert.equal(qc.original.width,160);
  assert.equal(qc.original.height,284);
  assert.equal(qc.technicalStatus,'pass');
  assert.equal(qc.artisticStatus,'awaiting-author-review');
  assert.equal(qc.publicationApproved,false);
  assert.equal(qc.authorReview.publicationApproved,false);
  assert.deepEqual(qc.variants.map(x=>x.id),['natural-clean','warm-cinematic','muted-filmic']);
  for(const variant of qc.variants){
   assert.equal(variant.technicalStatus,'pass');
   assert.ok(variant.statistics);
   assert.ok(Array.isArray(variant.additionalSampledJumps));
   assert.equal(variant.temporalFlicker.status,'measured','FFmpeg temporal filter must return real timestamp samples');
   assert.equal(variant.temporalFlicker.sampleRate,12);
   assert.ok(variant.temporalFlicker.alignedSamples>=10);
   assert.ok(Array.isArray(variant.temporalFlicker.candidates));
  }
  assert.ok(qc.visualEvidence.frames.length>=3);
  for(const frame of qc.visualEvidence.frames){
   assert.equal(frame.pairs.length,3);
   for(const pair of frame.pairs)assert.ok((await stat(join(qc.visualEvidence.directory,pair.filename))).size>1000);
  }
  assert.deepEqual(JSON.parse(await readFile(reportPath,'utf8')),qc);
  const review=await createPersonaReviewPackage({comparisonDir:folder});
  assert.equal(review.technicalStatus,'pass');
  assert.equal(review.artisticStatus,'awaiting-author-review');
  assert.equal(review.publicationApproved,false);
  const html=await readFile(review.htmlPath,'utf8');
  assert.match(html,/Художественная приёмка: ОЖИДАЕТ АВТОРА/);
  assert.match(html,/Публикация: ЗАПРЕЩЕНА/);
  assert.match(html,/pair-01-natural-clean\.jpg/);
  assert.doesNotMatch(html,/https?:\/\//);
  assert.doesNotMatch(html,/C:\\Users\\/);
  const reviewQc=JSON.parse(await readFile(review.reportPath,'utf8'));
  const injection=renderPersonaReviewHtml({...reviewQc,original:{...reviewQc.original,fileName:'<script>alert(1)</script>'}},review.reviewDir);
  assert.doesNotMatch(injection,/<script>/);
  assert.match(injection,/&lt;script&gt;/);
  assert.equal(digest(await readFile(source)),before,'one-command review must not alter original');

  assert.equal(digest(await readFile(source)),before,'original source must stay byte-identical');
  const entries=await readdir(root);
  await assert.rejects(inspectPersonaComparisonPackage({comparisonDir:folder,outputPath:reportPath}),/already exists/);
  assert.deepEqual(await readdir(root),entries,'second QC must not modify existing report/evidence');
  const corrupt=join(folder,'A-natural-clean.mp4');
  await appendFile(corrupt,Buffer.from([0x01]));
  const badReport=join(root,'bad.json');
  await assert.rejects(inspectPersonaComparisonPackage({comparisonDir:folder,outputPath:badReport}),/SHA-256 mismatch/);
  assert.ok(!(await readdir(root)).includes('bad.json'));
  assert.ok(!(await readdir(root)).includes('bad-frames'));
 }finally{await rm(root,{recursive:true,force:true})}
});
