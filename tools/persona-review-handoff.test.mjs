import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {appendFile,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,join} from 'node:path';
import {createColorVariants} from './persona-color-variants.mjs';
import {createPersonaReviewHandoff,validatePersonaReviewBriefAgainstManifest} from './persona-review-handoff.mjs';

const hasMedia=['ffmpeg','ffprobe'].every(bin=>spawnSync(bin,['-version'],{encoding:'utf8'}).status===0);
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
const stamp='2026-11-03T13:00:00.000Z';

test('review preflight rejects wrong source, formula, publication flag and contradictory decision',()=>{
 const hashes=['1','2','3','4'].map(x=>x.repeat(64));
 const manifest={kind:'persona-color-variants-v1',version:1,
  status:'awaiting-author-comparison',publicationApproved:false,
  source:{path:'C:\\video\\source.mp4',sha256:hashes[0]},
  variants:[
   {id:'natural-clean',label:'Natural Clean',filter:'eq=1',path:'C:\\video\\A-natural-clean.mp4',sha256:hashes[1]},
   {id:'warm-cinematic',label:'Warm Cinematic',filter:'eq=2',path:'C:\\video\\B-warm-cinematic.mp4',sha256:hashes[2]},
   {id:'muted-filmic',label:'Muted Filmic',filter:'eq=3',path:'C:\\video\\C-muted-filmic.mp4',sha256:hashes[3]},
  ],
 };
 const brief={version:1,kind:'persona-color-review-brief-v1',exportedAt:stamp,
  publicationApproved:false,artisticStatus:'rejected-all',
  source:{fileName:'source.mp4',sha256:hashes[0]},
  variants:manifest.variants.map(x=>({id:x.id,label:x.label,filter:x.filter,sha256:x.sha256})),
  decision:{selectedVariantId:null,rejectedAll:true,comment:'Skin too orange',decidedAt:stamp},
  observations:[{variantId:'natural-clean',atSec:0.25,category:'skin',
   assessment:'issue',note:'Yellower than source',createdAt:stamp}],
  constraints:{noGenerativeFaceEdits:true,doNotOverwriteV2:true,authorApprovalRequired:true},
 };
 assert.equal(validatePersonaReviewBriefAgainstManifest(brief,manifest).observations.length,1);
 assert.throws(()=>validatePersonaReviewBriefAgainstManifest({...brief,publicationApproved:true},manifest),/unsupported brief/);
 assert.throws(()=>validatePersonaReviewBriefAgainstManifest({...brief,source:{...brief.source,sha256:hashes[3]}},manifest),/source SHA/);
 assert.throws(()=>validatePersonaReviewBriefAgainstManifest({...brief,variants:[
  {...brief.variants[0],filter:'dangerous arbitrary filter'},...brief.variants.slice(1)]},manifest),/variant natural-clean/);
 assert.throws(()=>validatePersonaReviewBriefAgainstManifest({...brief,decision:{
  ...brief.decision,selectedVariantId:'natural-clean'}},manifest),/reject-all/);
 assert.throws(()=>validatePersonaReviewBriefAgainstManifest({...brief,observations:[
  {...brief.observations[0],atSec:Infinity}]},manifest),/invalid note/);
 assert.throws(()=>validatePersonaReviewBriefAgainstManifest({...brief,constraints:{
  ...brief.constraints,doNotOverwriteV2:false}},manifest),/constraints/);
});

test('a real SHA-bound local review produces a non-destructive V3 handoff and refuses forged input',
 {skip:!hasMedia,timeout:180000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-handoff-'));
 try{
  const source=join(root,'source.mp4');
  const created=spawnSync('ffmpeg',['-hide_banner','-loglevel','error',
   '-f','lavfi','-i','testsrc2=size=160x284:rate=24:duration=1.4',
   '-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=1.4',
   '-map','0:v','-map','1:a','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',
   '-c:a','aac','-shortest',source],{encoding:'utf8',timeout:60000});
  assert.equal(created.status,0,created.stderr);
  const originalHash=hash(await readFile(source));
  const packageDir=join(root,'original-package');
  const manifest=await createColorVariants({inputPath:source,outputDir:packageDir});
  const makeBrief=(overrides={})=>({
   version:1,kind:'persona-color-review-brief-v1',exportedAt:stamp,
   publicationApproved:false,artisticStatus:'rejected-all',
   source:{fileName:basename(manifest.source.path),sha256:manifest.source.sha256},
   variants:manifest.variants.map(({id,label,filter,sha256})=>({id,label,filter,sha256})),
   decision:{selectedVariantId:null,rejectedAll:true,comment:'Skin needs a neutral reference',decidedAt:stamp},
   observations:[{variantId:'natural-clean',atSec:.5,category:'skin',assessment:'issue',
    note:'Too yellow: <script>test</script>',createdAt:stamp}],
   constraints:{noGenerativeFaceEdits:true,doNotOverwriteV2:true,authorApprovalRequired:true},
   ...overrides,
  });
  const briefPath=join(root,'PERSONA-REVIEW.json'),outputPath=join(root,'V3-HANDOFF.md');
  await writeFile(briefPath,JSON.stringify(makeBrief()));
  const report=await createPersonaReviewHandoff({briefPath,comparisonDir:packageDir,outputPath});
  assert.equal(report.notes,1);assert.equal(report.issues,1);
  assert.equal(report.artisticStatus,'rejected-all');
  assert.equal(report.publicationApproved,false);
  assert.equal(report.sourceSha256,originalHash);
  const handoff=await readFile(outputPath,'utf8');
  assert.match(handoff,/SHA-256/);assert.match(handoff,/не менять/);
  assert.match(handoff,/отклонил все три/);
  assert.match(handoff,/Too yellow/);
  assert.doesNotMatch(handoff,/C:\\Users|\/tmp\/persona-handoff/);
  assert.equal(hash(await readFile(source)),originalHash,'source must be byte-identical');
  await assert.rejects(createPersonaReviewHandoff({briefPath,comparisonDir:packageDir,outputPath}),/EEXIST/);
  const fakeBriefPath=join(root,'fake.json');
  await writeFile(fakeBriefPath,JSON.stringify(makeBrief({
   source:{fileName:basename(manifest.source.path),sha256:'f'.repeat(64)},
  })));
  await assert.rejects(createPersonaReviewHandoff({briefPath:fakeBriefPath,comparisonDir:packageDir,
   outputPath:join(root,'fake-output.md')}),/source SHA/);
  const unreviewed=makeBrief({artisticStatus:'awaiting-author-review',
   decision:{selectedVariantId:null,rejectedAll:false,comment:null,decidedAt:null},observations:[]});
  const pendingPath=join(root,'pending.json');
  await writeFile(pendingPath,JSON.stringify(unreviewed));
  await assert.rejects(createPersonaReviewHandoff({briefPath:pendingPath,comparisonDir:packageDir,
   outputPath:join(root,'pending.md')}),/no author observations or decision/);
  const outside=makeBrief({observations:[{...makeBrief().observations[0],atSec:19}]});
  const outsidePath=join(root,'outside.json');await writeFile(outsidePath,JSON.stringify(outside));
  await assert.rejects(createPersonaReviewHandoff({briefPath:outsidePath,comparisonDir:packageDir,
   outputPath:join(root,'outside.md')}),/outside actual video duration/);
  const corrupt=join(packageDir,'A-natural-clean.mp4');
  await appendFile(corrupt,Buffer.from('tamper'));
  await assert.rejects(createPersonaReviewHandoff({briefPath,comparisonDir:packageDir,
   outputPath:join(root,'tampered.md')}),/actual file SHA-256 differs/);
  assert.equal(hash(await readFile(source)),originalHash,'tamper test never touches source');
 }finally{await rm(root,{recursive:true,force:true})}
});
