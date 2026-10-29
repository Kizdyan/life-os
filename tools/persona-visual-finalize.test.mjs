import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyLocalPersonaRender} from './persona-verify-render.mjs';
import {prepareVisualReview} from './persona-visual-review.mjs';
import {preflightVisualFinalize,finalizeVisualReel} from './persona-visual-finalize.mjs';

const json=(p,v)=>writeFile(p,JSON.stringify(v,null,2)+'\n');
const sha=b=>createHash('sha256').update(b).digest('hex');
test('reject incomplete or untrusted previous reviewed result before any writes',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-visual-final-gate-'));
 try{
  const reviewed=join(root,'reviewed'),output=join(root,'out');
  await mkdir(reviewed);
  await json(join(reviewed,'REVIEWED-RESULT.json'),{
   kind:'persona-reviewed-reel-v1',status:'awaiting-author-review',
   publicationApproved:true,distributionAllowed:false
  });
  await assert.rejects(()=>preflightVisualFinalize({reviewedDir:reviewed,
   packPath:join(root,'pack.json'),selectionPath:join(root,'select.json'),outputDir:output}),
   /unpublished technically reviewed/);
  await assert.rejects(()=>stat(output),/ENOENT/);
 }finally{await rm(root,{recursive:true,force:true})}
});
const available=['ffmpeg','ffprobe'].every(bin=>spawnSync(bin,['-version'],{encoding:'utf8'}).status===0);
test('real local visual approval -> newly cropped MP4 -> H264/AAC, SRT, fresh creative QA, no source edits',
 {skip:!available,timeout:300000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-visual-final-real-'));
 try{
  const reviewed=join(root,'reviewed'),visual=join(root,'visual'),final=join(root,'framed');
  await mkdir(reviewed);
  const originals=[];
  for(let i=0;i<2;i++){
   const file=join(root,'source'+i+'.mp4');
   const made=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i',
    'color=c='+(i?'blue':'red')+':s=320x240:r=30','-f','lavfi','-i',
    'sine=frequency='+(i?650:480)+':sample_rate=48000','-t','3',
    '-c:v','mpeg4','-c:a','aac','-shortest',file],{encoding:'utf8',timeout:35000});
   assert.equal(made.status,0,made.stderr);
   originals.push({path:file,bytes:await readFile(file)});
  }
  const timelinePath=join(reviewed,'reviewed-timeline.json');
  const timeline={version:1,width:1080,height:1920,fps:30,clips:originals.map((s,i)=>({
   beat:i+1,path:s.path,startSec:.2,durationSec:1.8,
   framing:{mode:'contain',position:{x:.5,y:.5}}
  }))};
  await json(timelinePath,timeline);
  const oldMovie=join(reviewed,'reviewed-reel.mp4');
  const rendered=spawnSync('ffmpeg',['-hide_banner','-loglevel','error',
   '-i',originals[0].path,'-t','2','-vf','scale=1080:1920,setsar=1',
   '-c:v','libx264','-preset','ultrafast','-c:a','aac',oldMovie],
   {encoding:'utf8',timeout:65000});
  assert.equal(rendered.status,0,rendered.stderr);
  const qaPath=join(reviewed,'reviewed-qa.json');
  const qa=await verifyLocalPersonaRender({path:oldMovie,contentId:'persona-reviewed',format:'reel',authorApproved:false,outputPath:qaPath});
  assert.equal(qa.handoff.passed,false);
  assert.deepEqual(qa.handoff.errors,['author approval required']);
  const briefPath=join(reviewed,'brief.json'),decisionsPath=join(reviewed,'reviewed-decisions.json');
  const lines=['Я актёр. И ещё пишу музыку.','И у нас есть проблема.'];
  await json(briefPath,{version:1,sourceFormat:'reel',
   script:lines.map((line,i)=>({order:i+1,line})),
   shots:lines.map((_,i)=>({order:i+1,action:'Реплика'}))});
  await json(decisionsPath,{version:1,briefPath,analysisPath:join(reviewed,'unused-analysis.json'),
   choices:lines.map((line,i)=>({beat:i+1,sourceId:'source'+i,startSec:.2,durationSec:1.8,
    transcript:line,confidence:.9,captionWords:[{text:line,startSec:.3,endSec:1.5,timing:'segment'}]}))});
  await json(join(reviewed,'REVIEWED-RESULT.json'),{version:1,kind:'persona-reviewed-reel-v1',
   status:'awaiting-author-review',publicationApproved:false,distributionAllowed:false,
   output:oldMovie,qaPath,timelinePath,decisionsPath});
  await json(join(reviewed,'creative-review.json'),{version:1,kind:'persona-creative-review-v1',
   status:'unreviewed',publicationApproved:false,scenes:lines.map((line,i)=>({
    beat:i+1,scriptLine:line,checks:{performance:true,framing:true},remarks:'',issues:[]
   }))});
  const prepared=await prepareVisualReview(timelinePath,visual);
  assert.equal(prepared.scenes,2);
  const pack=JSON.parse(await readFile(prepared.packPath,'utf8'));
  const selections={version:1,kind:'persona-visual-framing-selection-v1',publicationApproved:false,
   scenes:pack.scenes.map(x=>({beat:x.beat,sourceSha256:x.sourceSha256,
    framing:{mode:'cover',position:{x:.75,y:.5}},reviewed:true,reason:'Лицо и клавиши в кадре'}))};
  const selectionPath=join(root,'visual.reviewed.json');
  await json(selectionPath,selections);
  const result=await finalizeVisualReel({reviewedDir:reviewed,packPath:prepared.packPath,selectionPath,outputDir:final});
  assert.equal(result.status,'awaiting-author-review');
  assert.equal(result.publicationApproved,false);
  assert.equal(result.distributionAllowed,false);
  assert.ok((await stat(result.output)).size>1000);
  assert.match(await readFile(result.captionDraft.srtPath,'utf8'),/Я актёр/);
  assert.equal(JSON.parse(await readFile(result.qaPath,'utf8')).handoff.passed,false);
  const fresh=JSON.parse(await readFile(result.creativeReview,'utf8'));
  assert.equal(fresh.scenes[0].checks.performance,null,'prior human review is no longer approval after reframing');
  const framed=JSON.parse(await readFile(result.timelinePath,'utf8'));
  assert.equal(framed.clips[0].framing.mode,'cover');
  assert.equal(framed.clips[0].framing.position.x,.75);
  for(const item of originals)assert.deepEqual(await readFile(item.path),item.bytes);
  assert.equal(sha(await readFile(oldMovie)),qa.evidence.sha256);
  await assert.rejects(()=>finalizeVisualReel({reviewedDir:reviewed,
   packPath:prepared.packPath,selectionPath,outputDir:final}),/EEXIST/);
 }finally{await rm(root,{recursive:true,force:true})}
});
