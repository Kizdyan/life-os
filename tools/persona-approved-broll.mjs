#!/usr/bin/env node
/**
 * Persona Local Library -> approved silent B-roll interstitials -> REAL FFmpeg MP4.
 *
 * Inserts author-reviewed archive shots ONLY between recorded/spoken beats,
 * never replaces a spoken beat. Re-times the existing transcript-based captions
 * so downstream lines do not start early. No social posting or auto-approval.
 *
 * template <TIMELINE.json> <ASSET-MATCHES.json> <CATALOG.json>
 *          <captions.review.json> <NEW-SELECTION.json>
 * render   <TIMELINE.json> <ASSET-MATCHES.json> <CATALOG.json>
 *          <captions.review.json> <REVIEWED-SELECTION.json> <NEW-OUTPUT-DIR>
 */
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {access,mkdir,readFile,realpath,lstat,stat,writeFile} from 'node:fs/promises';
import {dirname,extname,isAbsolute,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {verifyLocalPersonaRender} from './persona-verify-render.mjs';

const fail=m=>{throw Error('Persona B-roll: '+m)};
const shaLike=x=>typeof x==='string'&&/^[a-f0-9]{64}$/i.test(x);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const inside=(root,path)=>{
 const r=relative(root,path);return r===''||(r!=='..'&&!r.startsWith('..'+sep)&&!isAbsolute(r));
};
async function shaFile(path){
 const hash=createHash('sha256');for await(const part of createReadStream(path))hash.update(part);
 return hash.digest('hex');
}
async function jsonAndSha(path){
 const text=await readFile(resolve(path),'utf8');
 return {value:JSON.parse(text),sha256:createHash('sha256').update(text).digest('hex')};
}
async function unavailable(path){
 await access(resolve(path)).then(()=>fail('Output already exists: '+path),e=>{
  if(e?.code!=='ENOENT')throw e;
 });
}
function timelineBeats(timeline){
 if(timeline?.version!==1||!Array.isArray(timeline.clips)||
  timeline.clips.length<2||timeline.clips.length>29)fail('Expected 2–29 verified spoken clips');
 let previous=0,cursor=0;const starts=new Map();
 for(const [i,clip] of timeline.clips.entries()){
  const beat=clip.beat??i+1;
  if(beat!==i+1||beat<=previous||!finite(clip.durationSec)||clip.durationSec<.25||
   clip.durationSec>60||typeof clip.path!=='string'||!clip.path.trim()||
   !finite(clip.startSec)||clip.startSec<0||clip.muteSourceAudio===true)
   fail('Unsafe or non-sequential source dialogue timeline');
  previous=beat;
  starts.set(beat,{startMs:Math.round(cursor*1000),endMs:Math.round((cursor+clip.durationSec)*1000)});
  cursor+=clip.durationSec;
 }
 return starts;
}
function checkInputs(timeline,matches,catalog,captions){
 const starts=timelineBeats(timeline);
 if(matches?.kind!=='persona-brief-local-asset-matches-v1'||matches.version!==1||
  matches.publicationApproved!==false||!Array.isArray(matches.shots)||
  matches.shots.length!==timeline.clips.length)fail('Invalid exact shot match report');
 if(catalog?.kind!=='persona-local-library-v1'||!Array.isArray(catalog.assets)||
  (typeof catalog.root!=='string'||!catalog.root.trim()))fail('Invalid local catalog');
 if(matches.librarySnapshotAt!==catalog.generatedAt)fail('Stale library report: re-run shot matcher');
 if(captions?.kind!=='persona-subtitle-draft-v1'||captions.version!==1||
  !Array.isArray(captions.cues)||!captions.cues.length||captions.status!=='needs-human-review')
  fail('Expected existing unapproved, timed caption review');
 for(const cue of captions.cues){
  const frame=starts.get(cue.beat);
  if(!frame||!Number.isSafeInteger(cue.startMs)||!Number.isSafeInteger(cue.endMs)||
   cue.startMs<frame.startMs-20||cue.endMs>frame.endMs+20||
   cue.endMs<=cue.startMs||typeof cue.text!=='string'||!cue.text.trim())
   fail('Caption does not fit its original spoken beat');
 }
 const ordered=[...captions.cues].sort((a,b)=>a.startMs-b.startMs);
 for(let i=1;i<ordered.length;i++)if(ordered[i].startMs<ordered[i-1].endMs)
  fail('Overlapping original captions');
 return starts;
}
function templateSelection({timeline,matches,catalog,captions,sha}){
 checkInputs(timeline,matches,catalog,captions);
 const videoIds=new Set(catalog.assets.filter(a=>a.kind==='video'&&a.availability==='local').map(a=>a.id));
 const suggestions=[];
 for(const shot of matches.shots){
  if(!Number.isInteger(shot.order)||shot.order<1||shot.order>timeline.clips.length)
   fail('Invalid shot order in match report');
  const candidate=shot.candidates?.find(x=>videoIds.has(x.assetId));
  if(!candidate)continue;
  const t=finite(candidate.startSec)?candidate.startSec:0;
  const max=finite(candidate.endSec)?candidate.endSec-t:1.2;
  if(max<.25)continue;
  suggestions.push({afterBeat:shot.order,assetId:candidate.assetId,
   startSec:t,durationSec:Number(Math.min(max,1.2).toFixed(3)),
   authorReviewed:false,rightsConfirmed:false,editorialReason:'',
   framing:{mode:'contain'}});
 }
 return {version:1,kind:'persona-broll-author-selection-v1',
  timelineSha256:sha.timeline,matchesSha256:sha.matches,
  catalogSha256:sha.catalog,captionsSha256:sha.captions,
  author:'',approvedForEdit:false,publicationApproved:false,
  reviewedAt:null,choices:suggestions,
  notice:'This file is an UNAPPROVED TEMPLATE. View each candidate, check rights and audio context. Only explicit author review can enable render. Never publish automatically.'};
}
export async function createBrollReviewTemplate({
 timelinePath,matchesPath,catalogPath,captionsPath,outputPath,
}={}){
 if(![timelinePath,matchesPath,catalogPath,captionsPath,outputPath].every(x=>typeof x==='string'&&x.trim()))
  fail('Four actual inputs and NEW selection template output required');
 const [timeline,matches,catalog,captions]=await Promise.all(
  [timelinePath,matchesPath,catalogPath,captionsPath].map(jsonAndSha));
 const data=templateSelection({timeline:timeline.value,matches:matches.value,
  catalog:catalog.value,captions:captions.value,sha:{
   timeline:timeline.sha256,matches:matches.sha256,catalog:catalog.sha256,
   captions:captions.sha256}});
 await writeFile(resolve(outputPath),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
 return {output:resolve(outputPath),candidates:data.choices.length,status:'AWAITING_AUTHOR_BROLL_SELECTION'};
}
function validateReviewedSelection(selection,sha,timeline){
 if(selection?.kind!=='persona-broll-author-selection-v1'||selection.version!==1||
  selection.publicationApproved!==false||selection.approvedForEdit!==true||
  !['timeline','matches','catalog','captions'].every(key=>selection[key+'Sha256']===sha[key])||
  typeof selection.author!=='string'||!selection.author.trim()||
  !Number.isFinite(Date.parse(selection.reviewedAt))||
  !Array.isArray(selection.choices)||selection.choices.length<1||
  selection.choices.length>Math.min(10,30-timeline.clips.length))
  fail('Reviewed selection missing, stale, or not explicitly authorized for editing');
 const seen=new Set();
 for(const c of selection.choices){
  if(!Number.isInteger(c?.afterBeat)||c.afterBeat<1||c.afterBeat>timeline.clips.length||
   seen.has(c.afterBeat)||!(typeof c.assetId==='string'&&/^sha256:[a-f0-9]{64}$/i.test(c.assetId))||
   c.authorReviewed!==true||c.rightsConfirmed!==true||
   !finite(c.startSec)||c.startSec<0||
   !finite(c.durationSec)||c.durationSec<.25||c.durationSec>1.9||
   typeof c.editorialReason!=='string'||c.editorialReason.trim().length<10||
   c.framing?.mode!=='contain')
   fail('Every B-roll insert requires explicit author review, cleared rights, a reason, and safe time bounds');
  seen.add(c.afterBeat);
 }
 return true;
}
function timecode(ms,vtt){
 if(!Number.isSafeInteger(ms)||ms<0)fail('Bad subtitle timecode');
 const s=Math.floor(ms/1000),milli=String(ms%1000).padStart(3,'0');
 return String(Math.floor(s/3600)).padStart(2,'0')+':'+String(Math.floor(s%3600/60)).padStart(2,'0')+
  ':'+String(s%60).padStart(2,'0')+(vtt?'.':',')+milli;
}
function safeCaption(text){
 if(typeof text!=='string'||!text.trim()||/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(text))
  fail('Invalid caption content');
 return text;
}
export function shiftCaptions(review,choices){
 const ordered=[...choices].sort((a,b)=>a.afterBeat-b.afterBeat);
 const shifted=review.cues.map(cue=>{
  const offset=ordered.filter(c=>c.afterBeat<cue.beat)
   .reduce((sum,c)=>sum+Math.round(c.durationSec*1000),0);
  return {...cue,startMs:cue.startMs+offset,endMs:cue.endMs+offset};
 });
 return {version:1,kind:'persona-broll-caption-review-v1',status:'needs-human-review',
  cues:shifted,sourceTiming:review.captionTiming,
  warnings:[...(review.warnings||[]),
   'B-roll was inserted BETWEEN complete dialogue shots, not over speech. Captions were shifted but not burned into the MP4.',
   'Re-check final subtitle timing, inserted silent audio, cuts, music and rights before distribution.'],
  publicationApproved:false};
}
function captionFiles(review){
 const cues=review.cues;
 return {
  srt:cues.map((c,i)=>(i+1)+'\n'+timecode(c.startMs,false)+' --> '+timecode(c.endMs,false)+'\n'+safeCaption(c.text)+'\n').join('\n')+'\n',
  vtt:'WEBVTT\n\n'+cues.map(c=>timecode(c.startMs,true)+' --> '+timecode(c.endMs,true)+'\n'+safeCaption(c.text)+'\n').join('\n')+'\n',
 };
}
async function approvedClips(selection,matches,catalog,timeline){
 const sourceRoot=await realpath(catalog.root);
 const candidatesByBeat=new Map(matches.shots.map(x=>[x.order,x.candidates||[]]));
 const approved=new Map();
 for(const choice of selection.choices){
  const asset=catalog.assets.find(a=>a.id===choice.assetId&&a.availability==='local'&&a.kind==='video');
  if(!asset||!shaLike(asset.sha256)||asset.id!=='sha256:'+asset.sha256)
   fail('Selected asset missing or unsupported');
  const candidates=candidatesByBeat.get(choice.afterBeat)||[];
  const matched=candidates.some(c=>c.assetId===choice.assetId&&c.sourcePath===asset.sourcePath&&
   c.sha256===asset.sha256&&
   (c.startSec===null||(choice.startSec>=c.startSec-.001))&&
   (c.endSec===null||(choice.startSec+choice.durationSec<=c.endSec+.001)));
  if(!matched)fail('Selection does not belong to proven scenario candidates');
  if(!finite(asset.metadata?.durationSec)||choice.startSec+choice.durationSec>
   asset.metadata.durationSec+.001)fail('B-roll time range exceeds indexed media duration');
  if(!new Set(['.mp4','.mov','.mkv','.webm','.m4v']).has(extname(asset.sourcePath).toLowerCase()))
   fail('Only real local video B-roll supported');
  const link=await lstat(asset.sourcePath);
  if(link.isSymbolicLink()||!link.isFile())fail('B-roll source must be a regular file');
  const actualPath=await realpath(asset.sourcePath);
  if(!inside(sourceRoot,actualPath)||actualPath===sourceRoot)fail('B-roll source escaped selected library root');
  if((await stat(actualPath)).size!==asset.bytes)fail('B-roll file size differs from index');
  if(await shaFile(actualPath)!==asset.sha256)fail('B-roll source hash differs from indexed hash');
  approved.set(choice.afterBeat,{beat:choice.afterBeat,sourcePath:actualPath,
   sha256:asset.sha256,sourceTimeSec:choice.startSec,durationSec:choice.durationSec,
   evidence:matched?'reviewed_archive_candidate':'unavailable',
   editorialReason:choice.editorialReason.trim()});
 }
 const clips=[];
 for(const [i,clip] of timeline.clips.entries()){
  clips.push({...clip});
  const insert=approved.get(i+1);
  if(insert){
   clips.push({path:insert.sourcePath,startSec:insert.sourceTimeSec,
    durationSec:insert.durationSec,framing:{mode:'contain'},muteSourceAudio:true,
    brollAfterBeat:i+1});
  }
 }
 return {clips,approved:[...approved.values()]};
}
function run(bin,args,timeout=240000){
 return new Promise((ok,bad)=>{
  const p=spawn(bin,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='',done=false;
  const timer=setTimeout(()=>{if(!done){done=true;p.kill();bad(Error('Render timeout'))}},timeout);
  p.stdout.on('data',b=>{stdout=(stdout+b).slice(-10000)});
  p.stderr.on('data',b=>{stderr=(stderr+b).slice(-10000)});
  p.on('error',e=>{if(!done){done=true;clearTimeout(timer);bad(e)}});
  p.on('close',code=>{if(done)return;done=true;clearTimeout(timer);
   code===0?ok({stdout,stderr}):bad(Error('Renderer failed: '+stderr))});
 });
}
export async function renderApprovedBroll({
 timelinePath,matchesPath,catalogPath,captionsPath,selectionPath,outputDir,
 rendererPath=fileURLToPath(new URL('./persona-timeline-render.mjs',import.meta.url)),
}={}){
 if(![timelinePath,matchesPath,catalogPath,captionsPath,selectionPath,outputDir]
  .every(x=>typeof x==='string'&&x.trim()))fail('Five input files and a NEW output directory required');
 const [timeline,matches,catalog,captions,selection]=await Promise.all(
  [timelinePath,matchesPath,catalogPath,captionsPath,selectionPath].map(jsonAndSha));
 checkInputs(timeline.value,matches.value,catalog.value,captions.value);
 validateReviewedSelection(selection.value,{
  timeline:timeline.sha256,matches:matches.sha256,catalog:catalog.sha256,
  captions:captions.sha256},timeline.value);
 const {clips,approved}=await approvedClips(selection.value,matches.value,catalog.value,timeline.value);
 if(clips.length>30||clips.reduce((sum,c)=>sum+c.durationSec,0)>900)
  fail('Composite exceeds existing timeline renderer limits');
 const out=resolve(outputDir);await unavailable(out);
 if(inside(await realpath(catalog.value.root),out))fail('Output cannot be inside the watched media originals');
 const stage={...timeline.value,clips,version:1};
 const shifted=shiftCaptions(captions.value,selection.value.choices);
 const captionsOut=captionFiles(shifted);
 await mkdir(out,{recursive:false});
 const projectPath=join(out,'approved-broll-timeline.json'),video=join(out,'approved-broll-draft.mp4');
 try{
  await Promise.all([
   writeFile(projectPath,JSON.stringify(stage,null,2)+'\n',{flag:'wx'}),
   writeFile(join(out,'captions.broll.draft.srt'),captionsOut.srt,{flag:'wx'}),
   writeFile(join(out,'captions.broll.draft.vtt'),captionsOut.vtt,{flag:'wx'}),
   writeFile(join(out,'captions.broll.review.json'),JSON.stringify(shifted,null,2)+'\n',{flag:'wx'}),
  ]);
  // Resolve file URL for Windows paths via fileURLToPath, never use shell interpolation.
  const executable=rendererPath.startsWith('file:')?fileURLToPath(rendererPath):resolve(rendererPath);
  await run(process.execPath,[executable,projectPath,video]);
  const result=await verifyLocalPersonaRender({path:video,contentId:'persona-reviewed-broll-draft',
   format:'reel',authorApproved:false,outputPath:join(out,'broll-qa.json')});
  const technicalErrors=result.handoff.errors.filter(x=>!x.includes('author approval'));
  if(technicalErrors.length)fail('Technical QA failed: '+technicalErrors.join('; '));
  const summary={kind:'persona-approved-broll-render-v1',version:1,status:'AWAITING_AUTHOR_REVIEW',
   output:video,project:projectPath,qa:join(out,'broll-qa.json'),originalTimeline:resolve(timelinePath),
   sourceSha256:{timeline:timeline.sha256,matches:matches.sha256,
    catalog:catalog.sha256,captions:captions.sha256,selection:selection.sha256},
   broll:approved,clipCount:clips.length,subtitleReview:join(out,'captions.broll.review.json'),
   publicationApproved:false,distributionAllowed:false,
   note:'Real B-roll was added between complete spoken beats; archive sound intentionally muted. Check creative timing, silence, music, reframing, subtitles and rights. No publication or author approval.'};
  await writeFile(join(out,'BROLL-RESULT.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
  return summary;
 }catch(e){
  await writeFile(join(out,'FAILED.json'),JSON.stringify({
   status:'BLOCKED',reason:String(e?.message??e),publicationApproved:false},null,2)+'\n',{flag:'wx'}).catch(()=>{});
  throw e;
 }
}
const usage='Usage:\n'+
 ' node tools/persona-approved-broll.mjs template <TIMELINE.json> <ASSET-MATCHES.json> <CATALOG.json> <captions.review.json> <NEW-SELECTION.json>\n'+
 ' node tools/persona-approved-broll.mjs render <TIMELINE.json> <ASSET-MATCHES.json> <CATALOG.json> <captions.review.json> <REVIEWED-SELECTION.json> <NEW-OUTPUT-DIR>';
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [command,...args]=process.argv.slice(2);
 try{
  const fields={timelinePath:args[0],matchesPath:args[1],catalogPath:args[2],
   captionsPath:args[3]};
  const result=command==='template'&&args.length===5
   ?await createBrollReviewTemplate({...fields,outputPath:args[4]})
   :command==='render'&&args.length===6
    ?await renderApprovedBroll({...fields,selectionPath:args[4],outputDir:args[5]})
    :fail(usage);
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
 }catch(e){process.stderr.write(String(e?.message??e)+'\n');process.exitCode=1}
}
