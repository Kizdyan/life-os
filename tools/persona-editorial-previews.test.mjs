import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildReviewHtml,verifyPreviewPack,generatePreviews} from './persona-editorial-previews.mjs';

const sig='a'.repeat(64);
const minimal={version:1,kind:'persona-editorial-candidate-pack-v1',
 beats:[{beat:1,scriptLine:'Я актёр. И ещё пишу музыку.',candidates:[
  {beat:1,candidateId:'beat1-a',sourceId:'a',startSec:0.4,durationSec:1.4,confidence:.87,
   transcript:'Я актёр. И ещё пишу музыку.',sourceSha256:sig,technicalWarnings:['low_average_luma_review']}
 ]},{beat:2,scriptLine:'И у нас есть проблема.',candidates:[
  {beat:2,candidateId:'beat2-b',sourceId:'b',startSec:0.2,durationSec:1.2,confidence:.9,
   transcript:'И у нас есть проблема.',sourceSha256:sig,technicalWarnings:[]}
 ]}]};
const evidence={version:1,kind:'persona-evidence-v1',
 sources:[{id:'a',path:'a.mp4',sha256:sig,durationSec:3},
 {id:'b',path:'b.mp4',sha256:sig,durationSec:3}]};

test('candidate previews reject malformed pack and mismatched hashes/intervals',()=>{
 assert.equal(verifyPreviewPack(minimal,evidence),true);
 const wrong=structuredClone(minimal);
 wrong.beats[1].candidates[0].sourceSha256='b'.repeat(64);
 assert.throws(()=>verifyPreviewPack(wrong,evidence),/trusted source evidence/);
 const outside=structuredClone(minimal);
 outside.beats[0].candidates[0].durationSec=6;
 assert.throws(()=>verifyPreviewPack(outside,evidence),/trusted source evidence/);
 const duplicate=structuredClone(minimal);
 duplicate.beats[1].candidates[0].candidateId='beat1-a';
 assert.throws(()=>verifyPreviewPack(duplicate,evidence),/trusted source evidence/);
});

test('standalone review page includes video playback and safe manual selection export',()=>{
 const template={version:1,kind:'persona-editorial-selection-v1',
  selections:[{beat:1},{beat:2}]};
 const html=buildReviewHtml(minimal,template,{'beat1-a':'beat-01-candidate-01.mp4','beat2-b':'beat-02-candidate-01.mp4'});
 assert.match(html,/video controls playsinline/);
 assert.match(html,/Сохранить мой выбор в JSON/);
 assert.match(html,/selection\.reviewed\.json/);
 assert.match(html,/reviewed=true/);
 assert.match(html,/beat-01-candidate-01\.mp4/);
 assert.match(html,/Whisper: Я актёр/);
 const evil=structuredClone(minimal);
 evil.beats[0].scriptLine='<img src=x onerror=alert(1)>';
 const clean=buildReviewHtml(evil,template,{'beat1-a':'beat-01-candidate-01.mp4','beat2-b':'beat-02-candidate-01.mp4'});
 assert.ok(!clean.includes('<img src=x onerror=alert(1)>'));
 assert.ok(clean.includes('&lt;img'));
});

test('recovery review page keeps an unmatched recorded take available for a separate manual transcript',()=>{
 const pack=structuredClone(minimal);
 pack.beats[1].candidates=[];
 pack.beats[1].recovery={status:'needs-transcript-review',availableSources:[{
  sourceId:'b',sourceSha256:sig,durationSec:3,hasAudio:true,asrStatus:'empty'
 }]};
 const html=buildReviewHtml(pack,{version:1,kind:'persona-editorial-selection-v1',selections:[{beat:1},{beat:2}]},
  {candidates:{'beat1-a':'beat-01-candidate-01.mp4'},recovery:{b:'source-b-inspection.mp4'}});
 assert.match(html,/Recovery Review/);
 assert.match(html,/source-b-inspection\.mp4/);
 assert.match(html,/manual-segment-v1/);
 assert.match(html,/не подменяет исходный Whisper/);
 assert.match(html,/transcriptSource/);
});

const installed=['ffmpeg','ffprobe'].every(x=>spawnSync(x,['-version'],{encoding:'utf8'}).status===0);
test('real FFmpeg preview clips created with preserved originals and no overwrite',{skip:!installed,timeout:180000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-editorial-previews-'));
 try{
  const a=join(root,'a.mp4'),b=join(root,'b.mp4');
  for(const [i,path] of [a,b].entries()){
   const gen=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i',
    'color=c='+(i?'blue':'red')+':s=240x320:r=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000',
    '-t','3','-c:v','mpeg4','-c:a','aac','-shortest',path],{encoding:'utf8',timeout:30000});
   assert.equal(gen.status,0,gen.stderr);
  }
  const original=[await readFile(a),await readFile(b)];
  const pack=structuredClone(minimal),ev=structuredClone(evidence);
  for(const [i,path] of [a,b].entries()){
   ev.sources[i].path=path;
   ev.sources[i].sha256=createHash('sha256').update(original[i]).digest('hex');
   pack.beats[i].candidates[0].sourceSha256=ev.sources[i].sha256;
  }
  const packPath=join(root,'pack.json'),evidencePath=join(root,'analysis.json'),target=join(root,'previews');
  await writeFile(packPath,JSON.stringify(pack));
  await writeFile(evidencePath,JSON.stringify(ev));
  const produced=await generatePreviews({packPath,evidencePath,outputDir:target});
  assert.equal(produced.previewCount,2);
  assert.match(await readFile(produced.reviewHtml,'utf8'),/video controls/);
  assert.ok((await stat(join(target,'beat-01-candidate-01.mp4'))).size>1000);
  assert.deepEqual(await readFile(a),original[0]);assert.deepEqual(await readFile(b),original[1]);
  await assert.rejects(()=>generatePreviews({packPath,evidencePath,outputDir:target}),/EEXIST/);
  await writeFile(a,'tampered video');
  await assert.rejects(()=>generatePreviews({packPath,evidencePath,outputDir:join(root,'tampered')}),/Source changed/);
 }finally{await rm(root,{recursive:true,force:true})}
});

test('real FFmpeg generates a local inspection proxy for a take with no ASR candidate',{skip:!installed,timeout:180000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-recovery-preview-'));
 try{
  const source=join(root,'source.mp4');
  const gen=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=green:s=240x320:r=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','2','-c:v','mpeg4','-c:a','aac','-shortest',source],{encoding:'utf8',timeout:30000});
  assert.equal(gen.status,0,gen.stderr);
  const bytes=await readFile(source),hash=createHash('sha256').update(bytes).digest('hex');
  const pack={version:1,kind:'persona-editorial-candidate-pack-v1',beats:[{beat:1,scriptLine:'Нераспознанная реплика',candidates:[],recovery:{status:'needs-transcript-review',availableSources:[{sourceId:'take',sourceSha256:hash,durationSec:2,hasAudio:true,asrStatus:'empty'}]}}]};
  const ev={version:1,kind:'persona-evidence-v1',sources:[{id:'take',path:source,sha256:hash,durationSec:2,hasAudio:true}]};
  const packPath=join(root,'pack.json'),evidencePath=join(root,'analysis.json'),target=join(root,'previews');
  await writeFile(packPath,JSON.stringify(pack));await writeFile(evidencePath,JSON.stringify(ev));
  const produced=await generatePreviews({packPath,evidencePath,outputDir:target});
  assert.equal(produced.previewCount,0);assert.equal(produced.recoveryPreviewCount,1);
  assert.ok((await stat(join(target,'source-take-inspection.mp4'))).size>1000);
  assert.deepEqual(await readFile(source),bytes);
 }finally{await rm(root,{recursive:true,force:true})}
});
