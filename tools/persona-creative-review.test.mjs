import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateCreativeProfile,makeCreativeReview,summarizeCreativeReview,formatCreativeReview,initReview,finishReview} from './persona-creative-review.mjs';

const profile={version:1,kind:'persona-creative-profile-v1',immutableIdentity:['face','glasses'],
 reviewCategories:['performance','framing','glasses','skinTone','captions','sound','cutRhythm','musicTail']};
const pack={kind:'persona-editorial-candidate-pack-v1',beats:[
 {beat:1,scriptLine:'Я актёр. И ещё пишу музыку.',defaultCandidateId:'beat1-one'},
 {beat:2,scriptLine:'И у нас есть проблема.',defaultCandidateId:'beat2-two'}
]};

test('creative QA starts unreviewed, without fake aesthetic scores or approval',()=>{
 assert.equal(validateCreativeProfile(profile),true);
 const review=makeCreativeReview(pack,profile);
 assert.equal(review.scenes.length,2);
 assert.ok(Object.values(review.scenes[0].checks).every(v=>v===null));
 assert.equal(review.publicationApproved,false);
 assert.ok(!JSON.stringify(review).includes('actingScore'));
 const {summary}=summarizeCreativeReview(review,profile);
 assert.equal(summary.unresolvedCount,2);
 assert.equal(summary.status,'needs-human-review');
});

test('creative QA follows explicitly reviewed replacement takes, not obsolete defaults',()=>{
 const options=structuredClone(pack);
 options.beats[0].candidates=[{candidateId:'beat1-replacement'}];
 options.beats[1].candidates=[{candidateId:'beat2-two'}];
 const selection={kind:'persona-editorial-selection-v1',selections:[
  {beat:1,candidateId:'beat1-replacement',reviewed:true,reason:'Лучшая пауза'},
  {beat:2,candidateId:'beat2-two',reviewed:true,reason:'Лучший взгляд'}
 ]};
 const review=makeCreativeReview(options,profile,selection);
 assert.equal(review.scenes[0].selectedCandidateId,'beat1-replacement');
 const invalid=structuredClone(selection);
 invalid.selections[0].reviewed=false;
 assert.throws(()=>makeCreativeReview(options,profile,invalid),/explicitly reviewed/);
 invalid.selections[0].reviewed=true;invalid.selections[0].candidateId='unknown';
 assert.throws(()=>makeCreativeReview(options,profile,invalid),/explicitly reviewed/);
});

test('creative review tracks verified manually recovered speech and rejects changed source IDs',()=>{
 const pack={kind:'persona-editorial-candidate-pack-v1',beats:[
  {beat:1,scriptLine:'Я актёр',defaultCandidateId:'existing',candidates:[{candidateId:'existing'}]},
  {beat:2,scriptLine:'И у нас есть проблема',defaultCandidateId:null,candidates:[],
   recovery:{availableSources:[{sourceId:'B01',sourceSha256:'b'.repeat(64),durationSec:3,hasAudio:true}]}}
 ]};
 const selection={kind:'persona-editorial-selection-v1',selections:[
  {beat:1,candidateId:'existing',reviewed:true,reason:'Проверил'},
  {beat:2,candidateId:null,reviewed:true,reason:'Услышал реплику',
   recovery:{kind:'persona-manual-segment-v1',confirmed:true,sourceId:'B01',
    sourceSha256:'b'.repeat(64),startSec:.2,durationSec:1.8,
    transcript:'И у нас есть проблема'}}
 ]};
 const review=makeCreativeReview(pack,profile,selection);
 assert.match(review.scenes[1].selectedCandidateId,/^manual:B01:/);
 assert.equal(review.publicationApproved,false);
 selection.selections[1].recovery.sourceSha256='c'.repeat(64);
 assert.throws(()=>makeCreativeReview(pack,profile,selection),/explicitly reviewed/);
});

test('human checks and issues persist; even green QA cannot authorize publication',()=>{
 const review=makeCreativeReview(pack,profile);
 for(const scene of review.scenes)
  for(const key of profile.reviewCategories)scene.checks[key]=true;
 const clean=summarizeCreativeReview(review,profile);
 assert.equal(clean.summary.status,'ready-for-separate-author-approval');
 assert.equal(clean.summary.publicationApproved,false);
 review.scenes[1].checks.framing=false;
 review.scenes[1].remarks='Обрезаны клавиши и рука';
 review.scenes[1].issues=['Вернуть клавиши в кадр'];
 const flagged=summarizeCreativeReview(review,profile);
 assert.equal(flagged.summary.unresolvedCount,1);
 assert.equal(flagged.summary.scenes[1].status,'changes-requested');
 assert.equal(flagged.memory.observations[0].remark,'Обрезаны клавиши и рука');
 assert.equal(flagged.memory.usedForModelTraining,false);
 assert.match(formatCreativeReview(flagged.summary),/Вернуть клавиши в кадр/);
});

test('missing recorded scene cannot become ready for approval even with all checks marked true',()=>{
 const blank=structuredClone(pack);
 blank.beats[0].defaultCandidateId=null;
 const review=makeCreativeReview(blank,profile);
 for(const scene of review.scenes)for(const key of profile.reviewCategories)scene.checks[key]=true;
 const result=summarizeCreativeReview(review,profile);
 assert.equal(result.summary.scenes[0].missingTake,true);
 assert.equal(result.summary.unresolvedCount,1);
 assert.equal(result.summary.status,'needs-human-review');
 assert.equal(result.summary.publicationApproved,false);
});

test('invalid or forged review data rejected',()=>{
 const review=makeCreativeReview(pack,profile);
 assert.throws(()=>summarizeCreativeReview({...review,approved:true},profile),/Invalid or unsafe/);
 review.scenes[0].checks.performance=1;
 assert.throws(()=>summarizeCreativeReview(review,profile),/true\/false\/null/);
 review.scenes[0].checks.performance=false;
 assert.throws(()=>summarizeCreativeReview(review,profile),/Explain failed/);
 review.scenes[0].issues=['Слишком торопливая реакция'];
 assert.equal(summarizeCreativeReview(review,profile).summary.scenes[0].failed[0],'performance');
 review.scenes[0].checks.unknown=true;
 assert.throws(()=>summarizeCreativeReview(review,profile),/Unexpected QA check field/);
});

test('writes structured template and readable report but refuses overwrite',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-creative-'));
 try{
  const packPath=join(dir,'pack.json'),profilePath=join(dir,'profile.json'),
   reviewPath=join(dir,'review.json'),reportPath=join(dir,'report.md'),memoryPath=join(dir,'feedback.json');
  await writeFile(packPath,JSON.stringify(pack));
  await writeFile(profilePath,JSON.stringify(profile));
  const first=await initReview(packPath,profilePath,reviewPath);
  assert.equal(first.scenes,2);
  const finished=await finishReview(reviewPath,profilePath,reportPath,memoryPath);
  assert.equal(finished.status,'needs-human-review');
  assert.match(await readFile(reportPath,'utf8'),/художественная приёмка/);
  assert.equal(JSON.parse(await readFile(memoryPath,'utf8')).observations.length,0);
  await assert.rejects(()=>initReview(packPath,profilePath,reviewPath),/EEXIST/);
  await assert.rejects(()=>finishReview(reviewPath,profilePath,reportPath,memoryPath),/EEXIST/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
