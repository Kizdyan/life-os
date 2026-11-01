#!/usr/bin/env node
/** One-command local speech-aware Persona Reel (draft only; never publishes). */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import {prepare} from './persona-editorial-choices.mjs';
import {generatePreviews} from './persona-editorial-previews.mjs';
import {initReview} from './persona-creative-review.mjs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, assemble } from './persona-semantic-montage.mjs';
import { transcribe, plan } from './persona-semantic-autoselect.mjs';
import { writeSubtitleDraft } from './persona-subtitle-draft.mjs';
import { makeManifest } from './persona-delivery-source-folder.mjs';

const fail = m => {throw Error(m)};
const exists = async p => stat(p).then(()=>true,()=>false);
const home = dirname(fileURLToPath(import.meta.url));
function call(bin,args,{timeout=20*60*1000}={}) {
 return new Promise((ok,bad)=>{
  const child=spawn(bin,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let error='',output='',done=false;
  const timer=setTimeout(()=>{if(!done){done=true;child.kill();bad(Error('Process timeout: '+bin))}},timeout);
  child.stdout.on('data',b=>{output=(output+b).slice(-20000)});
  child.stderr.on('data',b=>{error=(error+b).slice(-3000)});
  child.on('error',e=>{if(!done){done=true;clearTimeout(timer);bad(e)}});
  child.on('close',code=>{if(!done){done=true;clearTimeout(timer);code===0?ok(output):bad(Error('Process failed ('+code+'): '+error))}});
 });
}
function temporaryBinPath(binDir){
 if(!binDir)return;
 const k=Object.keys(process.env).find(key=>key.toUpperCase()==='PATH')||'PATH';
 process.env[k]=resolve(binDir)+(process.platform==='win32'?';':':')+(process.env[k]||'');
 // process-level PATH only; the machine/user environment is untouched.
}
/**
 * Fail closed if a verifier exits 0 but emits incomplete/unsafe QA.
 * The one expected handoff blocker is explicit author approval.
 */
export function validateDraftQa(qa,expectedPath){
 const evidence=qa?.evidence,gate=qa?.handoff;
 if(!evidence || evidence.path!==resolve(expectedPath) ||
   evidence.fileExists!==true || evidence.probeVerified!==true ||
   !Number.isSafeInteger(evidence.bytes) || evidence.bytes<=0 ||
   !/^[a-f0-9]{64}$/i.test(evidence.sha256||'') ||
   !Number.isFinite(evidence.durationSec) || evidence.durationSec<=0 ||
   evidence.width!==1080 || evidence.height!==1920 || evidence.fps!==30 ||
   evidence.videoCodec!=='h264' || evidence.audioCodec!=='aac' ||
   evidence.blackFrameCheckPassed!==true || evidence.audioCheckPassed!==true)
   fail('MP4 technical QA invalid or failed: inspect qa.json; delivery blocked');
 if(gate?.passed!==false || gate.status!=='blocked' ||
   !Array.isArray(gate.errors) || gate.errors.length!==1 ||
   gate.errors[0]!=='author approval required' ||
   !Array.isArray(gate.assets) || gate.assets.length!==1 ||
   gate.assets[0]?.passed!==true || qa.distribution!==null)
   fail('Unexpected publication handoff or QA errors: delivery blocked');
 return true;
}
/** Technical evidence for actual runtime, not proof of creative approval. */
export function assessFirstReelTiming(brief,qa){
 const durations=brief?.script?.map(beat=>beat?.durationSec);
 if(!Array.isArray(durations)||!durations.length||
    durations.some(value=>typeof value!=='number'||!Number.isFinite(value)||value<=0))
  return {status:'brief-duration-unavailable',targetDurationSec:null,
   renderedDurationSec:qa?.evidence?.durationSec??null,differenceSec:null,
   reviewRequired:true,notice:'No validated brief duration: inspect the video before approval.'};
 const targetDurationSec=Number(durations.reduce((sum,value)=>sum+value,0).toFixed(3));
 const renderedDurationSec=qa?.evidence?.durationSec;
 if(typeof renderedDurationSec!=='number'||!Number.isFinite(renderedDurationSec)||renderedDurationSec<=0)
  fail('Verified MP4 duration missing for timing acceptance');
 const differenceSec=Number((renderedDurationSec-targetDurationSec).toFixed(3));
 const mismatch=Math.abs(differenceSec)>0.25;
 return {status:mismatch?'needs-human-timing-review':'within-brief-tolerance',
  targetDurationSec,renderedDurationSec,differenceSec,reviewRequired:true,
  notice:mismatch?'The ASR edit differs from scripted runtime. Review pauses, B03 music and A04 payoff; do not time-stretch speech or claim a 31-second approved Reel.':'Runtime is close to script; music, acting and pacing still require author review.'};
}
export function validateFirstReelMode(mode='strict'){
 if(!['strict','preview'].includes(mode))fail('Invalid editorial decision mode');
 return mode;
}
/**
 * Recovery is a legitimate, non-rendered outcome of ASR failure. Keep the
 * original evidence, offer local playable source proxies and do NOT claim QA.
 * The existing editorial/apply and re-render steps can resume without ASR.
 */
export async function prepareAsrRecovery({root,analysisPath,briefPath,reason}={}){
 if(![root,analysisPath,briefPath].every(x=>typeof x==='string'&&x.trim()))
  fail('Recovery needs an existing draft directory, analysis and brief');
 const dir=resolve(root),analysis=resolve(analysisPath),brief=resolve(briefPath);
 const briefJson=JSON.parse(await readFile(brief,'utf8'));
 if(briefJson?.version!==1||briefJson.sourceFormat!=='reel'||!Array.isArray(briefJson.script)||
    briefJson.script.length<2||briefJson.script.length>30)
  fail('Invalid original production brief for recovery');
 const decisionsPath=join(dir,'decisions.json');
 const missingBeats=briefJson.script.map((_,i)=>i+1);
 const fallback={version:1,mode:'preview',recoveryRequired:true,analysisPath:analysis,briefPath:brief,
  choices:[],missingBeats,publicationApproved:false,
  notice:'Incomplete ASR evidence; no video render or publication approval. Review the real source manually.'};
 await writeFile(decisionsPath,JSON.stringify(fallback,null,2)+'\n',{flag:'wx'});
 const kit=join(dir,'editorial-review-kit');
 await mkdir(kit,{recursive:false});
 const packPath=join(kit,'candidate-pack.json'),selectionPath=join(kit,'selection.json');
 const prepared=await prepare({analysisPath:analysis,briefPath:brief,decisionsPath,packPath,selectionPath});
 const previews=await generatePreviews({packPath,evidencePath:analysis,outputDir:join(kit,'previews')});
 const creative=await initReview(packPath,resolve(home,'../docs/persona-creative-profile-v1.json'),join(kit,'creative-review.template.json'));
 const kitStatus={version:1,kind:'persona-review-kit-v1',status:'ready-for-human-selection',
  recovery:true,publicationApproved:false,
  candidatePack:prepared.packPath,selectionTemplate:selectionPath,playableReviewPage:previews.reviewHtml,
  creativeQaTemplate:creative.reviewPath,previewCount:previews.previewCount,
  missingBeats:previews.missingBeats};
 await writeFile(join(kit,'KIT.json'),JSON.stringify(kitStatus,null,2)+'\n',{flag:'wx'});
 const recoveryResult={version:1,kind:'persona-asr-recovery-v1',status:'needs-manual-transcript-review',
  publicationApproved:false,distributionAllowed:false,
  analysisPath:analysis,briefPath:brief,decisionsPath,reviewKit:kit,
  reviewHtml:previews.reviewHtml,missingBeats,reason:String(reason??'ASR did not match the script').slice(0,2000),
  next:'Open reviewHtml, compare playable local videos, manually confirm source, time bounds and transcript. Save selection.reviewed.json; run media:review:render to resume without repeating Whisper.'};
 await writeFile(join(dir,'RECOVERY-RESULT.json'),JSON.stringify(recoveryResult,null,2)+'\n',{flag:'wx'});
 await writeFile(join(dir,'RECOVERY-RESULT.md'),[
  '# Persona · требуется ручное восстановление речи','',
  '**Это не готовый MP4 и не разрешение на публикацию.**','',
  'Автоматическое распознавание или подбор реплики не завершились: '+recoveryResult.reason,'',
  'Откройте локальную страницу: '+previews.reviewHtml,
  'Посмотрите исходники; для пропущенных сцен укажите источник, начальное время, длительность и реально услышанный текст.',
  'Сохраните selection.reviewed.json и выполните media:review:render с новым каталогом результата.',
  'Whisper-файлы и исходные видеозаписи сохранены. При отсутствии аудио сцену требуется переснять.',''
 ].join('\n'),{flag:'wx'});
 return recoveryResult;
}
export async function runFirstReel({sources,brief,outputDir,whisperCli,whisperModel,ffmpegDir,mode='strict',rendererPath=join(home,'persona-timeline-render.mjs'),verifierPath=join(home,'persona-verify-render.mjs'),transcribeStep=transcribe}={}){
 if(![sources,brief,outputDir,whisperCli,whisperModel].every(x=>typeof x==='string'&&x.trim()))fail('Provide sources, brief, new output dir, local whisper-cli, and model paths');
 for(const file of [sources,brief,whisperCli,whisperModel])if(!await exists(resolve(file)))fail('Missing required local file: '+file);
 if(extname(resolve(whisperCli)).toLowerCase()==='.cmd')fail('Batch wrappers are not accepted: supply a native whisper-cli executable');
 if(process.platform==='win32'&&extname(resolve(whisperCli)).toLowerCase()!=='.exe')fail('Windows needs a native whisper-cli.exe, not an untrusted script wrapper');
 const modelFile=resolve(whisperModel),modelStats=await stat(modelFile);
 if(!modelStats.isFile()||modelStats.size<1024*1024)fail('Whisper model missing or too small; use an existing local multilingual ggml model');
 if(/(?:^|[._-])en(?:[._-]|$)/i.test(basename(modelFile)))fail('English-only Whisper model cannot reliably transcribe the Russian Reel; select a multilingual model');
 mode=validateFirstReelMode(mode);
 let requestedBrief;
 try{requestedBrief=JSON.parse(await readFile(resolve(brief),'utf8'))}
 catch{fail('Invalid PersonaProductionBrief JSON')}
 if(requestedBrief?.version!==1||requestedBrief.sourceFormat!=='reel'||
  !Array.isArray(requestedBrief.script)||requestedBrief.script.length<2||requestedBrief.script.length>30||
  !Array.isArray(requestedBrief.shots)||requestedBrief.shots.length!==requestedBrief.script.length||
  requestedBrief.script.some((line,i)=>line?.order!==i+1||typeof line.line!=='string'||!line.line.trim())||
  requestedBrief.shots.some((shot,i)=>shot?.order!==i+1))
  fail('Invalid Persona Reel brief: expected 2–30 ordered spoken beats with matching shots');
 // Bind the rendered result to this exact JSON brief, independent of whitespace.
 const briefFingerprintSha256=createHash('sha256').update(JSON.stringify(requestedBrief)).digest('hex');
 const root=resolve(outputDir);
 const input=resolve(sources);
 const inputStats=await stat(input);
 if(!inputStats.isFile()&&!inputStats.isDirectory())
  fail('Source must be a manifest, one supported video, or one selected recording folder');
 let selectedFolder=null;
 if(inputStats.isDirectory()){
  selectedFolder=await realpath(input);
  const child=relative(selectedFolder,root);
  // Fail before mkdir: never create output files inside the author's selected sources.
  if(child===''||(child!=='..'&&!child.startsWith('..'+sep)&&!isAbsolute(child)))
   fail('Output directory must be outside the selected source folder');
 }
 temporaryBinPath(ffmpegDir);
 await Promise.all([call('ffmpeg',['-version'],{timeout:8000}),call('ffprobe',['-version'],{timeout:8000})]);
 await mkdir(root,{recursive:false});
 const events=[];
 let recoveryAnalysisPath=null;
 try{
  // Delegate exact-filename selection to the existing safe, non-recursive intake.
  // It selects the first take only as an UNREVIEWED candidate, never the best performance.
  let sourcesManifest=input;
  let sourceSelection={kind:'manifest',path:input};
  if(selectedFolder){
   const intake=await makeManifest({sourceFolder:selectedFolder,outputFolder:join(root,'intake')});
   sourcesManifest=intake.manifest;
   sourceSelection={kind:'selected-folder',path:selectedFolder,manifest:intake.manifest,
    report:intake.report,layout:intake.layout};
   events.push('selected_folder_manifest_created');
  }else if(new Set(['.mp4','.mov','.mkv','.webm','.m4v']).has(extname(input).toLowerCase())){
   sourcesManifest=join(root,'sources.generated.json');
   await writeFile(sourcesManifest,JSON.stringify({version:1,sources:[{id:'single',path:input}]},null,2)+'\n',{flag:'wx'});
   sourceSelection={kind:'single-video',path:input,manifest:sourcesManifest};
   events.push('single_video_manifest_created');
  }else if(extname(input).toLowerCase()!=='.json'){
   fail('Source input must be a selected folder, supported video file, or sources.json');
  }
  const evidence=await analyze(sourcesManifest,join(root,'evidence'));
  recoveryAnalysisPath=evidence.analysis;
  events.push('media_evidence_generated');
  const transcripts=await transcribeStep(evidence.analysis,whisperCli,whisperModel);
  events.push('offline_asr_completed');
  const decisions=await plan(evidence.analysis,resolve(brief),join(root,'decisions.json'),mode);
  if(decisions.choices===0){
   // The zero-choice preview cannot be rendered. It is an ASR recovery,
   // not a malformed user project. Remove only the file just created by plan().
   await rm(decisions.decisions,{force:true});
   throw Error('No confidently matched dialogue remains; manual Recovery Review required');
  }
  events.push('dialogue_cuts_proposed');
  const assembled=await assemble(decisions.decisions,join(root,'timeline.json'));
  events.push('clips_verified_and_timeline_built');
  const subtitleDraft=await writeSubtitleDraft({briefPath:resolve(brief),timelinePath:assembled.project,decisionsPath:decisions.decisions,outputDir:root});
  events.push('reviewable_subtitle_sidecars_written');
  const output=join(root,'draft-reel.mp4');
  await call(process.execPath,[rendererPath,assembled.project,output]);
  events.push('real_mp4_rendered');
  const qaPath=join(root,'qa.json');
  await call(process.execPath,[verifierPath,output,'persona-first-reel','reel',qaPath]);
  const qa=JSON.parse(await readFile(qaPath,'utf8'));
  validateDraftQa(qa,output);
  events.push('technical_qa_passed');
  const timing=assessFirstReelTiming(requestedBrief,qa);
  if(timing.status==='needs-human-timing-review')events.push('duration_mismatch_requires_human_review');
  const summary={version:1,status:'awaiting-author-review',mode,events,sourceSelection,output,qaPath,renderProject:assembled.project,decisions:decisions.decisions,
    briefFingerprintSha256,briefIdeaId:typeof requestedBrief.ideaId==='string'?requestedBrief.ideaId:null,
    subtitleDraft,timing,
    warning:'Offline speech matching is not evaluation of acting, emotion, music or color. Subtitles are draft sidecars, not burned in or assured word-aligned. Check timing.status before author approval.',
    technicalChecks:qa.evidence??null,distributionAllowed:false};
  await writeFile(join(root,'RESULT.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
  return summary;
 }catch(error){
  if(recoveryAnalysisPath&&!events.includes('dialogue_cuts_proposed')){
   try{return await prepareAsrRecovery({root,analysisPath:recoveryAnalysisPath,briefPath:brief,reason:error.message});}
   catch(recoveryError){error=Error('ASR failed: '+error.message+'; Recovery preparation failed: '+recoveryError.message);}
  }
  await writeFile(join(root,'FAILED.json'),JSON.stringify({status:'failed',events,error:String(error.message||error),note:'Partial outputs retained for debugging; originals are not changed.'},null,2)+'\n',{flag:'wx'}).catch(()=>{});
  throw error;
 }
}
/** A manual Recovery Review is a valid artifact, but NOT a successful MP4 render. */
export function firstReelCliExitCode(result){
 return result?.status==='awaiting-author-review'&&
  typeof result?.output==='string'&&result.output.endsWith('draft-reel.mp4')?0:2;
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
 const [sources,brief,outputDir,whisperCli,whisperModel,ffmpegDir,mode]=process.argv.slice(2);
 runFirstReel({sources,brief,outputDir,whisperCli,whisperModel,ffmpegDir,mode:mode??'strict'})
  .then(result=>{
   console.log(JSON.stringify(result,null,2));
   const code=firstReelCliExitCode(result);
   if(code!==0){
    console.error('Persona first-reel runner: No rendered MP4. Manual Recovery Review is available at RECOVERY-RESULT.md in the selected draft directory. Audio/video QA must not run.');
    process.exitCode=code;
   }
  })
  .catch(e=>{console.error('Persona first-reel runner:',e.message);process.exitCode=1});
}
