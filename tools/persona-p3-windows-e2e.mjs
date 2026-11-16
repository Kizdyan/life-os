#!/usr/bin/env node
/** Persona P3 Windows/Linux real-MP4 technical E2E. Synthetic media only.
 * Coverage -> approved moments -> style gate -> reviewed zoom -> FFmpeg QA.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {mkdtemp,mkdir,writeFile,stat,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {coverageGate,approvedCandidates,styleGate,economicsCommand} from './persona-p3-adapter.mjs';
import {proposeIntercuts,applyReviewedZoomFallback} from './persona-intercut-planner.mjs';
const py=process.env.PERSONA_PYTHON || (process.platform==='win32'?'python':'python3');
function run(exe,args,{env,timeout=240000}={}){
 const r=spawnSync(exe,args,{env,encoding:'utf8',windowsHide:true,shell:false,timeout,maxBuffer:6*1024*1024});
 if(r.error||r.status!==0)throw Error(exe+' exited '+r.status+': '+(r.error?.message||r.stderr?.slice(-4000)||r.stdout?.slice(-1000)));
 return r.stdout;
}
async function hashFile(path){const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex');}
async function put(path,value){await writeFile(path,JSON.stringify(value,null,2)+'\n',{flag:'wx'});}
function video(path,freq){
 run('ffmpeg',['-hide_banner','-nostdin','-loglevel','error','-f','lavfi','-i','testsrc2=size=320x240:rate=30',
  '-f','lavfi','-i','sine=frequency='+freq+':sample_rate=48000','-t','2.8','-c:v','libx264',
  '-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-b:a','96k','-shortest',path],{timeout:90000});
}
function probe(path){return JSON.parse(run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',path]));}
function decodedFrameDigest(path,seconds){
 const data=run('ffmpeg',['-hide_banner','-nostdin','-loglevel','error','-ss',String(seconds),'-i',path,'-map','0:v:0','-frames:v','1','-an','-f','framemd5','-']);
 const frames=data.split(/\r?\n/).filter(s=>s&&!s.startsWith('#'));
 assert.equal(frames.length,1,'expected a single decoded frame');
 return frames[0].trim().split(',').at(-1).trim();
}
async function main(){
 const outputDir=process.env.PERSONA_E2E_OUTPUT_DIR?.trim();
 const root=outputDir ? resolve(outputDir) : await mkdtemp(join(tmpdir(),'persona-p3-e2e-'));
 const preserve=Boolean(outputDir);
 if(preserve)await mkdir(root,{recursive:true});
 try{
  const input=join(root,'input');await mkdir(input);
  const actor=join(input,'actor.mp4'),detail=join(input,'detail.mp4');
  video(actor,440);video(detail,660);
  const originalA=await hashFile(actor),originalB=await hashFile(detail);
  assert.notEqual(originalA,originalB,'sources must be distinct');
  const brief=join(root,'approved-brief.json'),bindings=join(root,'bindings.json');
  await put(brief,{version:1,shots:[{order:1,durationSec:1.1,kind:'visual',action:'Synthetic actor test scene'},
   {order:2,durationSec:1.1,kind:'visual',action:'Synthetic detail test scene'}],
   script:[{order:1,durationSec:1.1,line:''},{order:2,durationSec:1.1,line:''}]});
  await put(bindings,{version:1,bindings:[
   {sceneOrder:1,file:'actor.mp4',sha256:originalA,visualReviewedBy:'E2E_FIXTURE',visualActionConfirmed:true},
   {sceneOrder:2,file:'detail.mp4',sha256:originalB,visualReviewedBy:'E2E_FIXTURE',visualActionConfirmed:true}]});
  const coverage=await coverageGate({brief,input,bindings,approvalSha256:await hashFile(brief),output:join(root,'coverage.json')});
  assert.equal(coverage.status,'PASS',JSON.stringify(coverage.report.summary));
  assert.equal(coverage.report.summary.COVERED,2);
  const db=join(root,'moments.sqlite3');
  run(py,['tools/approved_moments_library.py','--db',db,'add','--video',actor,'--start','0.1','--end','1.1',
   '--kind','reaction','--score','5','--reviewer','E2E_FIXTURE','--confirmed']);
  const moments=await approvedCandidates({database:db,video:actor,kind:'reaction'});
  assert.equal(moments.length,1);assert.equal(moments[0].sourceSha256,originalA);
  const timeline={version:1,width:320,height:568,fps:30,publicationApproved:false,clips:[
   {path:actor,startSec:0,durationSec:1.3,framing:{mode:'contain'}},
   {path:actor,startSec:1.7,durationSec:0.7,framing:{mode:'contain'}},
   {path:detail,startSec:0.2,durationSec:1.2,framing:{mode:'contain'}}]};
  const proposal=proposeIntercuts(timeline,{eligibleBroll:[],zoomFallback:true});
  assert.equal(proposal.suggestions[0]?.status,'ZOOM_FALLBACK_CANDIDATE');
  const reviewed=applyReviewedZoomFallback(timeline,proposal,{reviewedAfterClips:[1]});
  assert.equal(reviewed.clips[0].intercutFallback?.authorReviewed,true);
  const renderIntent={inventoryComplete:true,effects:['slow_push_in'],transitions:['cut'],
   captions:{style:'cinematic',marginLeftRatio:0.1,marginRightRatio:0.1,marginTopRatio:0.15,
    marginBottomRatio:0.15,maxTextWidthRatio:0.8,maxLines:2},
   color:{preset:'natural-clean',colorSpace:'rec709-sdr',lutMix:0},publicationApproved:false};
  const finalPlan={...reviewed,styleId:'independent-artist-quiet-luxury',renderIntent};
  const planPath=join(root,'timeline-reviewed.json');await put(planPath,finalPlan);
  const style=await styleGate({plan:planPath});assert.equal(style.status,'PASS',JSON.stringify(style.result));
  const blockedPlan=join(root,'timeline-glitch-blocked.json');
  await put(blockedPlan,{...finalPlan,renderIntent:{...renderIntent,effects:['glitch']}});
  assert.equal((await styleGate({plan:blockedPlan})).status,'BLOCKED');
  const econDb=join(root,'economics.sqlite3'),job='synthetic-windows-e2e';
  await economicsCommand({database:econDb,command:'create',args:[job]});
  const started=await economicsCommand({database:econDb,command:'start',args:[job,'EDITING']});
  const target=join(root,'reviewed-zoom.mp4'),baseline=join(root,'plain-cut.mp4');
  const runnerEnv={...process.env,PERSONA_STAGE_CACHE:'0'};
  run(process.execPath,['tools/persona-timeline-render.mjs',planPath,target],{env:runnerEnv,timeout:480000});
  const plainPlan=join(root,'timeline-baseline.json');
  await put(plainPlan,{...finalPlan,clips:finalPlan.clips.map(({intercutFallback,...clip})=>clip),
   renderIntent:{...renderIntent,effects:[]}});
  run(process.execPath,['tools/persona-timeline-render.mjs',plainPlan,baseline],{env:runnerEnv,timeout:480000});
  await economicsCommand({database:econDb,command:'finish',args:[started.stageId]});
  const media=probe(target),duration=Number(media.format?.duration);
  assert.ok(Math.abs(duration-3.2)<0.3,'invalid output duration '+duration);
  assert.ok(media.streams?.some(s=>s.codec_type==='video'));
  assert.ok(media.streams?.some(s=>s.codec_type==='audio'));
  assert.ok((await stat(target)).size>1000);
  run('ffmpeg',['-v','error','-i',target,'-f','null','-'],{timeout:120000});
  const zoomFrame=decodedFrameDigest(target,1.13),plainFrame=decodedFrameDigest(baseline,1.13);
  assert.notEqual(zoomFrame,plainFrame,'zoom must change decoded end-of-scene pixels');
  assert.equal(await hashFile(actor),originalA,'actor source modified');
  assert.equal(await hashFile(detail),originalB,'detail source modified');
  await economicsCommand({database:econDb,command:'approve',args:[job,'--video',target,'--reviewer','E2E_FIXTURE','--confirmed']});
  const econ=await economicsCommand({database:econDb,command:'report',args:[job]});
  assert.equal(econ.acceptedMp4,1);assert.equal(econ.savingsVerified,false);
  const report={version:1,kind:'persona-p3-windows-technical-e2e-v1',status:'PASS',
   platform:process.platform,syntheticSources:true,publicationApproved:false,
   sources:[originalA,originalB],coverage:coverage.report.summary,approvedMoments:moments.length,
   style:style.status,forbiddenEffect:'BLOCKED',intercut:'reviewed-slow-push-in',
   zoomFrameDiffersFromPlain:true,outputDurationSec:duration,outputSha256:await hashFile(target),
   outputBytes:(await stat(target)).size,productionEconomics:{acceptedMp4:econ.acceptedMp4,savingsVerified:false},
   technicalOnly:true,artistQualityVerified:false};
  await put(join(root,'e2e-report.json'),report);
  console.log(JSON.stringify({...report,artifacts:root},null,2));
 }finally{
  if(!preserve)await rm(root,{recursive:true,force:true});
 }
}
main().catch(e=>{console.error('P3 Windows E2E FAILED: '+e.stack);process.exitCode=1});
