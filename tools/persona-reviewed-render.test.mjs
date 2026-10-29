import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm,stat,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyLocalPersonaRender} from './persona-verify-render.mjs';
import {preflightReviewedRender,renderReviewedReel} from './persona-reviewed-render.mjs';

const installed=['ffmpeg','ffprobe'].every(bin=>spawnSync(bin,['-version'],{encoding:'utf8'}).status===0);
const writeJson=(path,data)=>writeFile(path,JSON.stringify(data,null,2)+'\n');
const checksum=b=>createHash('sha256').update(b).digest('hex');

test('reviewed render refuses missing source draft and does not create output',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-reviewed-absent-'));
 try{
  const dest=join(root,'out');
  await assert.rejects(()=>preflightReviewedRender({draftDir:root,selectionPath:join(root,'selection.json'),outputDir:dest}),/ENOENT/);
  await assert.rejects(()=>stat(dest),/ENOENT/);
  await assert.rejects(()=>renderReviewedReel({draftDir:root,selectionPath:join(root,'selection.json'),outputDir:dest}),/ENOENT/);
 }finally{await rm(root,{recursive:true,force:true})}
});

test('blocks forged publication approval and expired draft hash before output creation',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-reviewed-preflight-'));
 try{
  const draft=join(root,'draft'),output=join(root,'out');
  await mkdir(draft);
  await writeFile(join(draft,'draft-reel.mp4'),Buffer.from('deliberate test placeholder'));
  const file=join(draft,'draft-reel.mp4'),bytes=(await stat(file)).size;
  const safe={evidence:{path:file,fileExists:true,probeVerified:true,bytes,
   sha256:checksum(await readFile(file)),durationSec:2,width:1080,height:1920,fps:30,
   videoCodec:'h264',audioCodec:'aac',blackFrameCheckPassed:true,audioCheckPassed:true},
   handoff:{passed:false,status:'blocked',errors:['author approval required'],assets:[{passed:true}]},
   distribution:null};
  await writeJson(join(draft,'qa.json'),safe);
  await writeJson(join(draft,'RESULT.json'),{status:'awaiting-author-review',
   distributionAllowed:false,output:file,qaPath:join(draft,'qa.json')});
  await writeFile(file,Buffer.from('modified since QA'));
  await assert.rejects(()=>preflightReviewedRender({draftDir:draft,selectionPath:join(root,'selection.json'),outputDir:output}),/changed since/);
  await assert.rejects(()=>stat(output),/ENOENT/);
  await writeFile(file,Buffer.from('deliberate test placeholder'));
  await writeJson(join(draft,'qa.json'),{...safe,handoff:{...safe.handoff,passed:true,status:'approved_for_distribution',errors:[]}});
  await assert.rejects(()=>preflightReviewedRender({draftDir:draft,selectionPath:join(root,'selection.json'),outputDir:output}),/publication handoff/);
 }finally{await rm(root,{recursive:true,force:true})}
});

test('real two-shot FFmpeg proof: human choice -> new MP4 and subtitles -> trusted QA, originals unchanged',{skip:!installed,timeout:240000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-reviewed-real-'));
 try{
  const draft=join(root,'draft'),kit=join(draft,'editorial-review-kit'),output=join(root,'reviewed');
  await mkdir(draft);await mkdir(kit);
  const sources=[];
  for(const [i,color] of ['red','blue'].entries()){
   const path=join(root,'take'+i+'.mp4');
   const args=['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c='+color+':s=240x320:r=30',
    '-f','lavfi','-i','sine=frequency='+(i?550:450)+':sample_rate=48000',
    '-t','2.5','-c:v','mpeg4','-c:a','aac','-shortest',path];
   const ff=spawnSync('ffmpeg',args,{encoding:'utf8',timeout:40000});
   assert.equal(ff.status,0,ff.stderr);
   const bytes=await readFile(path);
   sources.push({id:i?'B01_take01':'A01_take01',path,bytes:bytes.length,
    sha256:checksum(bytes),durationSec:2.5,
    technicalQuality:{warnings:[],blackIntervals:[]}});
  }
  const originals=await Promise.all(sources.map(s=>readFile(s.path)));
  const draftMP4=join(draft,'draft-reel.mp4');
  const generateDraft=spawnSync('ffmpeg',['-hide_banner','-loglevel','error',
   '-i',sources[0].path,'-t','2','-c:v','libx264','-preset','ultrafast',
   '-c:a','aac',draftMP4],{encoding:'utf8',timeout:60000});
  assert.equal(generateDraft.status,0,generateDraft.stderr);
  const oldQa=await verifyLocalPersonaRender({path:draftMP4,contentId:'persona-first-reel',format:'reel',
    authorApproved:false,outputPath:join(draft,'qa.json')});
  assert.deepEqual(oldQa.handoff.errors,['author approval required']);
  await writeJson(join(draft,'RESULT.json'),{status:'awaiting-author-review',distributionAllowed:false,
   output:draftMP4,qaPath:join(draft,'qa.json')});
  const analysisPath=join(draft,'analysis.json'),briefPath=join(draft,'brief.json'),decisionsPath=join(draft,'decisions.json');
  const script=['Я актёр. И ещё пишу музыку.','И у нас есть проблема.'];
  await writeJson(analysisPath,{version:1,kind:'persona-evidence-v1',sources});
  await writeJson(briefPath,{version:1,sourceFormat:'reel',
   script:script.map((line,i)=>({order:i+1,line})),
   shots:script.map((_,i)=>({order:i+1,action:'Реплика'}))});
  const oldChoices=sources.map((s,i)=>({beat:i+1,sourceId:s.id,startSec:0.2,durationSec:1.65,
   transcript:script[i],confidence:.9,reason:'Original offline speech matching'}));
  await writeJson(decisionsPath,{version:1,analysisPath,briefPath,choices:oldChoices});
  const pack={version:1,kind:'persona-editorial-candidate-pack-v1',analysisPath,briefPath,decisionsPath,
   beats:sources.map((s,i)=>({beat:i+1,scriptLine:script[i],defaultCandidateId:'beat'+(i+1),
    candidates:[{beat:i+1,candidateId:'beat'+(i+1),sourceId:s.id,startSec:0.2,durationSec:1.65,
     transcript:script[i],captionWords:[{text:script[i],startSec:0.35,endSec:1.55,timing:'segment'}],
     confidence:.9,reason:'Speech matching',technicalWarnings:[],sourceSha256:s.sha256}]}))};
  await writeJson(join(kit,'candidate-pack.json'),pack);
  await writeJson(join(kit,'KIT.json'),{version:1,kind:'persona-review-kit-v1',
   status:'ready-for-human-selection',publicationApproved:false});
  const selectionPath=join(root,'selection.reviewed.json');
  await writeJson(selectionPath,{version:1,kind:'persona-editorial-selection-v1',
   status:'human-reviewed-not-published',selections:pack.beats.map(x=>({beat:x.beat,
    candidateId:x.defaultCandidateId,reviewed:true,reason:'Reviewed clean acting take',rejected:[]}))});
  const result=await renderReviewedReel({draftDir:draft,selectionPath,outputDir:output});
  assert.equal(result.status,'awaiting-author-review');
  assert.equal(result.distributionAllowed,false);
  assert.equal(result.publicationApproved,false);
  assert.ok((await stat(result.output)).size>1000);
  assert.match(await readFile(result.subtitleDraft.srtPath,'utf8'),/Я актёр/);
  assert.equal(JSON.parse(await readFile(result.qaPath,'utf8')).handoff.passed,false);
  assert.equal(JSON.parse(await readFile(result.creativeReviewTemplate,'utf8')).status,'unreviewed');
  assert.equal(JSON.parse(await readFile(join(output,'REVIEWED-RESULT.json'),'utf8')).kind,'persona-reviewed-reel-v1');
  assert.ok((await stat(draftMP4)).size>1000);
  for(let i=0;i<originals.length;i++)assert.deepEqual(await readFile(sources[i].path),originals[i]);
  await assert.rejects(()=>renderReviewedReel({draftDir:draft,selectionPath,outputDir:output}),/EEXIST/);
 }finally{await rm(root,{recursive:true,force:true})}
});
