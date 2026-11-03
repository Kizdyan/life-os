import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBrollReviewTemplate,renderApprovedBroll,shiftCaptions} from './persona-approved-broll.mjs';

const ffmpegReady=['ffmpeg','ffprobe'].every(bin=>spawnSync(bin,['-version'],{encoding:'utf8'}).status===0);
const hash=b=>createHash('sha256').update(b).digest('hex');
const writeJson=async(path,obj)=>writeFile(path,JSON.stringify(obj,null,2)+'\n');
async function fixture(root,{video=false}={}){
 const inbox=join(root,'inbox'),out=join(root,'out');
 await mkdir(inbox);await mkdir(out);
 const assets=[join(inbox,'actor-a.mp4'),join(inbox,'actor-b.mp4'),join(inbox,'train.mp4')];
 if(video){
  for(const [i,file] of assets.entries()){
   const p=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-y',
    '-f','lavfi','-i','color=c='+(i===0?'red':i===1?'green':'blue')+':s=240x320:r=25',
    '-f','lavfi','-i','sine=frequency='+(440+i*100)+':sample_rate=48000',
    '-t','2.2','-c:v','mpeg4','-c:a','aac','-shortest',file],
   {encoding:'utf8',timeout:30000});
   assert.equal(p.status,0,p.stderr);
  }
 }else for(const file of assets)await writeFile(file,Buffer.from('synthetic-file-'+file));
 const actorSha=await Promise.all(assets.slice(0,2).map(async p=>hash(await readFile(p))));
 const trainSha=hash(await readFile(assets[2]));
 const cat={version:1,kind:'persona-local-library-v1',root:inbox,
  generatedAt:'2026-11-03T18:00:00.000Z',assets:[{
   id:'sha256:'+trainSha,sourcePath:assets[2],sha256:trainSha,bytes:(await stat(assets[2])).size,
   kind:'video',metadata:{durationSec:2.2},availability:'local',frames:[],annotation:{
    segments:[{startSec:.4,endSec:1.7,description:'Поезд движется вдоль платформы',
     tags:['железная дорога'],source:'author_annotation'}]}}]};
 const match={version:1,kind:'persona-brief-local-asset-matches-v1',publicationApproved:false,
  librarySnapshotAt:cat.generatedAt,totalShots:2,matchedShots:1,missingOrUnapprovedShots:2,
  shots:[{order:1,candidates:[{
   assetId:'sha256:'+trainSha,sourcePath:assets[2],sha256:trainSha,
   startSec:.4,endSec:1.7,evidence:'author_annotation',confidenceClaim:'candidate_only',
  }]},{order:2,candidates:[]}]};
 const timeline={version:1,width:240,height:320,fps:25,
  clips:[{beat:1,path:assets[0],startSec:0,durationSec:1.2},
   {beat:2,path:assets[1],startSec:0,durationSec:1.2}]};
 const captions={version:1,kind:'persona-subtitle-draft-v1',status:'needs-human-review',
  captionTiming:'word-level-from-whisper-timestamps',
  cues:[{beat:1,startMs:200,endMs:1100,text:'Я уезжаю'},
   {beat:2,startMs:1300,endMs:2300,text:'Но вернусь'}],
  warnings:[]};
 const paths={timelinePath:join(root,'timeline.json'),matchesPath:join(root,'matches.json'),
  catalogPath:join(root,'catalog.json'),captionsPath:join(root,'captions.json'),
  outputPath:join(root,'selection.json')};
 await Promise.all([[paths.timelinePath,timeline],[paths.matchesPath,match],
  [paths.catalogPath,cat],[paths.captionsPath,captions]].map(([p,o])=>writeJson(p,o)));
 const tpl=await createBrollReviewTemplate(paths);
 assert.equal(tpl.candidates,1);
 const selection=JSON.parse(await readFile(paths.outputPath,'utf8'));
 return {paths,selection,assets,trainSha,actorSha,root};
}
test('template never approves archive media automatically and anchors all source hashes',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-broll-safety-'));
 try{
  const f=await fixture(root),s=f.selection;
  assert.equal(s.kind,'persona-broll-author-selection-v1');
  assert.equal(s.approvedForEdit,false);
  assert.equal(s.publicationApproved,false);
  assert.equal(s.choices[0].authorReviewed,false);
  assert.equal(s.choices[0].rightsConfirmed,false);
  await assert.rejects(renderApprovedBroll({...f.paths,selectionPath:f.paths.outputPath,
   outputDir:join(root,'new-render')}),/not explicitly authorized/);
  await assert.rejects(stat(join(root,'new-render')),/ENOENT/);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('caption offsets preserve original spoken word timing while shifting following lines',()=>{
 const prior={captionTiming:'word-level',warnings:[],cues:[
  {beat:1,startMs:0,endMs:900,text:'Первое слово'},
  {beat:2,startMs:1100,endMs:2100,text:'Второе слово'},
  {beat:3,startMs:2400,endMs:3000,text:'Последнее'},
 ]};
 const result=shiftCaptions(prior,[{afterBeat:1,durationSec:.6},{afterBeat:2,durationSec:.75}]);
 assert.deepEqual(result.cues.map(c=>[c.startMs,c.endMs]),
  [[0,900],[1700,2700],[3750,4350]]);
 assert.equal(result.publicationApproved,false);
});
test('tampered media is rejected before output creation, even with an author-reviewed selection',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-broll-integrity-'));
 try{
  const f=await fixture(root);
  const selection={...f.selection,approvedForEdit:true,author:'Test human approval',
   reviewedAt:new Date().toISOString(),choices:f.selection.choices.map(c=>({
    ...c,authorReviewed:true,rightsConfirmed:true,editorialReason:'Explicit suitable atmosphere before the next beat',
   }))};
  const approved=join(root,'approved.json');await writeJson(approved,selection);
  await writeFile(f.assets[2],Buffer.from('tampered-after-index'));
  await assert.rejects(renderApprovedBroll({...f.paths,selectionPath:approved,
   outputDir:join(root,'should-not-exist')}),/hash differs|file size differs/);
  await assert.rejects(stat(join(root,'should-not-exist')),/ENOENT/);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('real FFmpeg: author-reviewed archive inserted between speech beats, sound muted, captions retimed, QA passed',{skip:!ffmpegReady},async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-broll-real-'));
 try{
  const f=await fixture(root,{video:true});
  const choice={...f.selection.choices[0],startSec:.5,durationSec:.65,
   authorReviewed:true,rightsConfirmed:true,
   editorialReason:'Verified train atmosphere belongs after first line'};
  const selection={...f.selection,approvedForEdit:true,author:'Explicit author test reviewer',
   reviewedAt:new Date().toISOString(),choices:[choice]};
  const selectionPath=join(root,'approved.json');await writeJson(selectionPath,selection);
  const rendered=await renderApprovedBroll({...f.paths,selectionPath,
   outputDir:join(root,'new-render')});
  assert.equal(rendered.status,'AWAITING_AUTHOR_REVIEW');
  assert.equal(rendered.publicationApproved,false);
  assert.equal(rendered.distributionAllowed,false);
  assert.equal(rendered.broll.length,1);
  assert.equal(rendered.clipCount,3);
  assert.ok((await stat(rendered.output)).size>1000);
  const timeline=JSON.parse(await readFile(rendered.project,'utf8'));
  assert.deepEqual(timeline.clips.map(c=>c.path),f.assets);
  assert.equal(timeline.clips[1].muteSourceAudio,true);
  assert.equal(timeline.clips[1].brollAfterBeat,1);
  const review=JSON.parse(await readFile(rendered.subtitleReview,'utf8'));
  assert.deepEqual(review.cues.map(x=>[x.startMs,x.endMs]),[[200,1100],[1950,2950]]);
  const report=JSON.parse(await readFile(rendered.qa,'utf8'));
  assert.equal(report.evidence.videoCodec,'h264');
  assert.equal(report.evidence.audioCodec,'aac');
  assert.equal(report.evidence.width,240);
  assert.equal(report.evidence.height,320);
  assert.equal(report.evidence.blackFrameCheckPassed,true);
  assert.equal(report.evidence.audioCheckPassed,true);
  assert.equal(report.handoff.passed,false,'Only author approval prevents publication');
  assert.ok(report.handoff.errors.every(x=>x.includes('author approval')));
  const renderManifest=JSON.parse(await readFile(rendered.output+'.persona.json','utf8'));
  assert.equal(renderManifest.clips[1].muteSourceAudio,true);
  assert.equal(renderManifest.audioLeveling.clips[1].sourceAudioMuted,true);
  assert.ok(Math.abs(report.evidence.durationSec-3.05)<.4);
  for(const [i,p] of f.assets.slice(0,2).entries())
   assert.equal(hash(await readFile(p)),f.actorSha[i]);
  assert.equal(hash(await readFile(f.assets[2])),f.trainSha);
  const decoded=spawnSync('ffmpeg',['-hide_banner','-v','error','-i',rendered.output,
   '-f','null','-'],{encoding:'utf8',timeout:30000});
  assert.equal(decoded.status,0,decoded.stderr);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('invalid reviewer decisions or out-of-evidence timecodes are refused',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-broll-refuse-'));
 try{
  const f=await fixture(root),base={...f.selection,approvedForEdit:true,
   author:'Reviewer',reviewedAt:new Date().toISOString()};
  const variants=[
   {...base,choices:[{...f.selection.choices[0],authorReviewed:false,rightsConfirmed:true,editorialReason:'test valid note'}]},
   {...base,choices:[{...f.selection.choices[0],authorReviewed:true,rightsConfirmed:false,editorialReason:'test valid note'}]},
   {...base,choices:[{...f.selection.choices[0],authorReviewed:true,rightsConfirmed:true,startSec:1.6,
    editorialReason:'test valid note'}]},
   {...base,timelineSha256:'0'.repeat(64),choices:[{...f.selection.choices[0],
    authorReviewed:true,rightsConfirmed:true,editorialReason:'test valid note'}]},
  ];
  for(let i=0;i<variants.length;i++){
   const p=join(root,'bad-'+i+'.json');await writeJson(p,variants[i]);
   await assert.rejects(renderApprovedBroll({...f.paths,selectionPath:p,
    outputDir:join(root,'out-'+i)}),/not explicitly authorized|Every B-roll insert|Selection does not belong/);
   await assert.rejects(stat(join(root,'out-'+i)),/ENOENT/);
  }
 }finally{await rm(root,{recursive:true,force:true})}
});
