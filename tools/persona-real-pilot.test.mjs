import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,rm,stat,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {assertOriginalsUnchanged,startRealPilot,resumeRealPilot} from './persona-real-pilot.mjs';

const originalBrief=new URL('../docs/persona-first-reel-production-brief-2026-10-29.json',import.meta.url);
const fakeHash=p=>createHash('sha256').update(p).digest('hex');
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'persona-real-pilot-test-'));
 const source=join(root,'originals');await mkdir(source);
 const video=join(source,'A01_actor_hook_take01.mov');
 await writeFile(video,Buffer.alloc(2048,7));
 await writeFile(join(source,'B01_composer_problem_take01.mov'),Buffer.alloc(2048,6));
 return {root,source,video,cleanup:()=>rm(root,{recursive:true,force:true})};
}
test('real-media pilot creates a review-only checkpoint and verifies original SHA',async()=>{
 const f=await fixture();
 try{
  const draft=join(f.root,'new-draft');let reviewed=false;
  const report=await startRealPilot({sources:f.source,outputDir:draft,
   whisperCli:'unused-in-stub',whisperModel:'unused-in-stub',
   runDraft:async opts=>{
    assert.equal(opts.mode,'strict');
    assert.equal(opts.outputDir,draft);
    await mkdir(draft);
    await writeFile(join(draft,'review.html'),'real local review placeholder');
    return {status:'needs-manual-transcript-review',reviewHtml:join(draft,'review.html'),
     publicationApproved:false,distributionAllowed:false};
   },
   createReview:async()=>{reviewed=true;throw Error('must not prepare successful draft review') }
  });
  assert.equal(reviewed,false);
  assert.equal(report.status,'NEEDS_MANUAL_ASR_REVIEW');
  assert.equal(report.takeComparisonStatus,'unknown');
  assert.equal(report.allRecordedTakesCompared,null);
  assert.equal(report.publicationApproved,false);
  assert.equal(report.video,null);
  assert.equal(report.originals.length,3,'two source videos and seven-beat brief hashed');
  assert.equal(JSON.parse(await readFile(join(draft,'PILOT.json'),'utf8')).reviewHtml,join(draft,'review.html'));
  assert.match(await readFile(join(draft,'PILOT.md'),'utf8'),/Это колыбельная\? Это финал триллера/);
  assert.equal((await stat(f.video)).size,2048);
  assert.throws(()=>assertOriginalsUnchanged(report.originals,[]),/Original video/);
 }finally{await f.cleanup()}
});

test('13 original named takes are hashed, but unreviewed alternatives are never called best',async()=>{
 const f=await fixture();
 try{
  const added=[
   'A02_actor_audition_take01.mov','B02_composer_deadline_take01.mov',
   'A03_actor_sleep_take01.mov','B03_composer_lullaby_take01.mov',
   'A04_actor_payoff_take01.mov','A01_actor_hook_take02.mov',
   'B01_composer_problem_take02.mov','A02_actor_audition_take02.mov',
   'B02_composer_deadline_take02.mov','A03_actor_sleep_take02.mov',
   'B03_composer_lullaby_take02.mov'
  ];
  for(const [i,name] of added.entries())
   await writeFile(join(f.source,name),Buffer.alloc(2048,i+20));
  const draft=join(f.root,'pilot-many-takes');
  const alternates=added.filter(name=>name.includes('_take02.'));
  const report=await startRealPilot({sources:f.source,outputDir:draft,runDraft:async()=>{
   await mkdir(draft);
   const intake=join(draft,'intake');await mkdir(intake);
   await writeFile(join(intake,'intake-report.json'),JSON.stringify({
    alternateTakes:alternates.map((name,i)=>({id:'alternative-'+i,file:name}))
   }));
   const reviewHtml=join(draft,'review.html');
   await writeFile(reviewHtml,'must be reviewed manually');
   return {status:'needs-manual-transcript-review',reviewHtml,
    publicationApproved:false,distributionAllowed:false};
  }});
  assert.equal(report.originals.length,14,'13 user recordings plus the brief fingerprinted');
  assert.equal(report.alternateTakes.length,6);
  assert.equal(report.takeComparisonStatus,'not_compared');
  assert.equal(report.allRecordedTakesCompared,false);
  assert.match(await readFile(join(draft,'PILOT.md'),'utf8'),/НЕ были автоматически проанализированы/);
 }finally{await f.cleanup()}
});

test('pilot refuses output through a symlink or Windows junction into originals',async()=>{
 const f=await fixture();
 try{
  const alias=join(f.root,'originals-alias');
  await symlink(f.source,alias,process.platform==='win32'?'junction':'dir');
  let invoked=0;
  await assert.rejects(startRealPilot({sources:f.source,outputDir:join(alias,'draft'),
   runDraft:async()=>{invoked++;}}),/symbolic links or Windows junctions|outside originals/);
  assert.equal(invoked,0);
 }finally{await f.cleanup()}
});

test('pilot refuses output inside originals, existing dirs and mutated user footage',async()=>{
 const f=await fixture();
 try{
  let invoked=0;
  const bad=join(f.source,'draft');
  await assert.rejects(startRealPilot({sources:f.source,outputDir:bad,
   runDraft:async()=>{invoked++;}}),/outside originals/);
  assert.equal(invoked,0);
  // A manifest bypassed the older folder-only guard; keep both modes safe.
  const manifest=join(f.root,'sources.json');
  await writeFile(manifest,JSON.stringify({version:1,sources:[
   {id:'A01',path:f.video},
   {id:'B01',path:join(f.source,'B01_composer_problem_take01.mov')}
  ]}));
  await assert.rejects(startRealPilot({sources:manifest,
   outputDir:join(f.source,'bad-from-manifest'),
   runDraft:async()=>{invoked++;}}),/outside originals/);
  assert.equal(invoked,0);
  const existing=join(f.root,'existing');await mkdir(existing);
  await assert.rejects(startRealPilot({sources:f.source,outputDir:existing,
   runDraft:async()=>{invoked++;}}),/already exists/);
  const target=join(f.root,'draft-mutated');
  await assert.rejects(startRealPilot({sources:f.source,outputDir:target,
   runDraft:async()=>{
    await mkdir(target);
    await writeFile(f.video,Buffer.alloc(2048,8));
    return {status:'needs-manual-transcript-review',reviewHtml:'none',
     publicationApproved:false,distributionAllowed:false};
   }}),/Original video or Production Brief changed/);
  assert.equal(invoked,0);
 }finally{await f.cleanup()}
});

test('review step refuses changed originals before invoking FFmpeg and forbids reused output',async()=>{
 const f=await fixture();
 try{
  const draft=join(f.root,'new-draft'),html=join(draft,'review.html');
  await startRealPilot({sources:f.source,outputDir:draft,runDraft:async()=>{
   await mkdir(draft);await writeFile(html,'test review');
   return {status:'needs-manual-transcript-review',reviewHtml:html,
    publicationApproved:false,distributionAllowed:false}
  }});
  const selection=join(f.root,'selection.reviewed.json');
  await writeFile(selection,'{}');
  let invoked=0;
  await writeFile(f.video,Buffer.alloc(2048,9));
  await assert.rejects(resumeRealPilot({draftDir:draft,selectionPath:selection,
   outputDir:join(f.root,'new-reviewed'),renderReviewed:async()=>{invoked++;}}),
   /Original video or Production Brief changed/);
  assert.equal(invoked,0);
 }finally{await f.cleanup()}
});

test('author-selected synthetic fixture receives independent QA and remains unpublished',async()=>{
 const f=await fixture();
 try{
  const draft=join(f.root,'draft'),html=join(draft,'review.html');
  await startRealPilot({sources:f.source,outputDir:draft,runDraft:async()=>{
   await mkdir(draft);await writeFile(html,'review');
   return {status:'needs-manual-transcript-review',reviewHtml:html,
    distributionAllowed:false,publicationApproved:false};
  }});
  const reviewedDir=join(f.root,'reviewed');
  const mp4=join(reviewedDir,'reviewed-reel.mp4');
  const selection=join(f.root,'selection.reviewed.json');await writeFile(selection,'{}');
  const timeline=join(reviewedDir,'timeline.json');
  const result=await resumeRealPilot({draftDir:draft,selectionPath:selection,outputDir:reviewedDir,
   renderReviewed:async()=>{
    await mkdir(reviewedDir);await writeFile(mp4,'synthetic-fixture-not-a-real-mp4');
    await writeFile(timeline,'{}');
    await writeFile(mp4+'.persona.json','{}');
    return {kind:'persona-reviewed-reel-v1',status:'awaiting-author-review',
     publicationApproved:false,distributionAllowed:false,output:mp4,timelinePath:join(reviewedDir,'reviewed-timeline.json'),
     renderManifestPath:mp4+'.persona.json',
     qaPath:join(reviewedDir,'reviewed-qa.json'),
     subtitleDraft:{srtPath:'test.srt'},creativeReviewTemplate:'checklist.json'};
   },
   analyzeQuality:async options=>{
    assert.equal(options.videoPath,mp4);
    assert.equal(options.timelinePath,mp4+'.persona.json');
    assert.equal(options.expectedDurationSec,31);
    return {status:'awaiting-author-review',publicationApproved:false,
     distributionAllowed:false,
     video:{sha256:fakeHash('synthetic-fixture-not-a-real-mp4')},
     findings:[{id:'scene_timeline',status:'measured',measurement:{scenes:Array.from({length:7},(_,i)=>({beat:i+1}))}},
      {id:'acting',status:'needs_human_review',summary:'Manual only'}]};
   }});
  assert.equal(result.status,'NEEDS_FULL_HUMAN_CREATIVE_REVIEW');
  assert.equal(result.publicationApproved,false);
  assert.equal(result.distributionAllowed,false);
  assert.equal(result.originalInputHashesVerified,true);
  assert.equal(result.warnings.length,1);
  assert.equal(JSON.parse(await readFile(join(reviewedDir,'PILOT-REVIEWED.json'),'utf8')).outputSha256,result.outputSha256);
 }finally{await f.cleanup()}
});
