#!/usr/bin/env node
/** One-command local speech-aware Persona Reel (draft only; never publishes). */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access,copyFile, mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import {constants as fsConstants} from 'node:fs';
import {prepare} from './persona-editorial-choices.mjs';
import {generatePreviews} from './persona-editorial-previews.mjs';
import {initReview} from './persona-creative-review.mjs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, assemble } from './persona-semantic-montage.mjs';
import { transcribe, plan } from './persona-semantic-autoselect.mjs';
import {createAsrRecoveryReport} from './persona-asr-recovery-report.mjs';
import {chooseAiEditorialCuts} from './persona-ai-editorial.mjs';
import {createColorVariants,renderVisualPreset} from './persona-color-variants.mjs';
import {getVisualPreset} from './persona-creative-director.mjs';
import { writeSubtitleDraft } from './persona-subtitle-draft.mjs';
import {burnPersonaSubtitles} from './persona-subtitle-burn.mjs';
import { makeManifest } from './persona-delivery-source-folder.mjs';
import {createGenericTakeManifest,isGenericTakeFolder} from './persona-generic-takes.mjs';

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
 const allBeats=briefJson.script.map((_,i)=>i+1);
 let missingBeats=allBeats,retainedAsrChoices=0,previewError=null;
 // Strict matching can fail on just B04 after six reliable ASR selections.
 // Preserve valid matching evidence as UNREVIEWED proposals, not approvals.
 try{
  await plan(analysis,brief,decisionsPath,'preview');
  const preview=JSON.parse(await readFile(decisionsPath,'utf8'));
  if(preview?.version!==1||preview.mode!=='preview'||
   !Array.isArray(preview.choices)||!Array.isArray(preview.missingBeats)||
   preview.choices.length+preview.missingBeats.length!==allBeats.length)
   fail('Untrusted partial ASR decision packet');
  retainedAsrChoices=preview.choices.length;
  missingBeats=preview.missingBeats;
  // A preview packet must be unambiguously marked as recovery-only even
  // when most or all individual speech candidates were found.
  await writeFile(decisionsPath,JSON.stringify({...preview,
   recoveryRequired:true,publicationApproved:false,
   notice:'Preserved ASR candidates await human review. This is NOT a complete production render or publication approval.'
  },null,2)+'\n');
 }catch(e){
  previewError=String(e?.message??e).slice(0,400);
  if(await exists(decisionsPath))throw Error('Incomplete preview decision file: '+previewError);
  const fallback={version:1,mode:'preview',recoveryRequired:true,
   analysisPath:analysis,briefPath:brief,choices:[],missingBeats:allBeats,
   publicationApproved:false,
   notice:'Whisper output incomplete; no video render or publication approval. Review original audio.'};
  await writeFile(decisionsPath,JSON.stringify(fallback,null,2)+'\n',{flag:'wx'});
 }
 const kit=join(dir,'editorial-review-kit');
 await mkdir(kit,{recursive:false});
 const packPath=join(kit,'candidate-pack.json'),selectionPath=join(kit,'selection.json');
 const prepared=await prepare({analysisPath:analysis,briefPath:brief,decisionsPath,packPath,selectionPath});
 // Actual ASR word differences are rendered next to B04's playback, without
 // granting edit approval. A failed diagnosis must NOT break Recovery Review.
 let asrDiagnostics=null,asrDiagnosticError=null,diagnosticData=null;
 try{
  asrDiagnostics=await createAsrRecoveryReport({analysisPath:analysis,
   briefPath:brief,outputDir:dir});
  diagnosticData=JSON.parse(await readFile(asrDiagnostics.jsonPath,'utf8'));
 }catch(e){
  asrDiagnosticError=String(e?.message??e).slice(0,400);
 }
 const previews=await generatePreviews({packPath,evidencePath:analysis,
  outputDir:join(kit,'previews'),diagnostics:diagnosticData});
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
  asrDiagnostics:asrDiagnostics?.jsonPath??null,
  asrDiagnosticsMarkdown:asrDiagnostics?.markdownPath??null,
  asrDiagnosticsError:asrDiagnosticError,
  reviewHtml:previews.reviewHtml,missingBeats,retainedAsrChoices,previewError,
  reason:String(reason??'ASR did not match the script').slice(0,2000),
  next:'Open reviewHtml, compare playable local videos, manually confirm source, time bounds and transcript. Save selection.reviewed.json; run media:review:render to resume without repeating Whisper.'};
 await writeFile(join(dir,'RECOVERY-RESULT.json'),JSON.stringify(recoveryResult,null,2)+'\n',{flag:'wx'});
 await writeFile(join(dir,'RECOVERY-RESULT.md'),[
  '# Persona · требуется ручное восстановление речи','',
  '**Это не готовый MP4 и не разрешение на публикацию.**','',
  'Автоматическое распознавание или подбор реплики не завершились: '+recoveryResult.reason,'',
  'Откройте локальную страницу: '+previews.reviewHtml,
  'Сохранены неподтверждённые ASR-кандидаты: '+retainedAsrChoices+' из '+allBeats.length+'.',
  'Сцены, требующие отдельной проверки: '+missingBeats.join(', ')+'.',
  'Посмотрите исходники; для пропущенных сцен укажите источник, начальное время, длительность и реально услышанный текст.',
  ...(asrDiagnostics?['','Фактическое сравнение Whisper со сценарием: '+asrDiagnostics.markdownPath,
   'Близость текста НЕ доказывает, что реплика была произнесена правильно.'] :
   asrDiagnosticError?['','Диагностика недоступна: '+asrDiagnosticError]:[]),
  'Сохраните selection.reviewed.json и выполните media:review:render с новым каталогом результата.',
  'Whisper-файлы и исходные видеозаписи сохранены. При отсутствии аудио сцену требуется переснять.',''
 ].join('\n'),{flag:'wx'});
 return recoveryResult;
}
export async function runFirstReel({sources,brief,outputDir,whisperCli,whisperModel,ffmpegDir,mode='strict',rendererPath=join(home,'persona-timeline-render.mjs'),verifierPath=join(home,'persona-verify-render.mjs'),transcribeStep=transcribe,aiEditorModel=null,aiVariation='cinematic',aiEditorialSelector=chooseAiEditorialCuts,burnSubtitles=false,visualPreset=null}={}){
 if(typeof burnSubtitles!=='boolean')fail('burnSubtitles must be boolean');
 if(visualPreset!==null)getVisualPreset(visualPreset);
 if(visualPreset!==null&&!aiEditorModel)fail('Visual direction requires the AI editorial pipeline');
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
   if(await isGenericTakeFolder(selectedFolder)){
    const intake=await createGenericTakeManifest({
     folderPath:selectedFolder,manifestPath:join(root,'sources.generic.json'),
    });
    sourcesManifest=intake.manifest;
    sourceSelection={kind:'selected-folder',path:selectedFolder,manifest:intake.manifest,
     layout:intake.layout,count:intake.count,notice:intake.note};
    events.push('variable_scene_sources_manifest_created');
   }else{
    const intake=await makeManifest({sourceFolder:selectedFolder,outputFolder:join(root,'intake')});
    sourcesManifest=intake.manifest;
    sourceSelection={kind:'selected-folder',path:selectedFolder,manifest:intake.manifest,
     report:intake.report,layout:intake.layout};
    events.push('selected_folder_manifest_created');
   }
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
  const manualScenes=requestedBrief.manualSource?.scenes;
  const sourceIds=manualScenes?JSON.parse(await readFile(evidence.analysis,'utf8')).sources.filter(src=>manualScenes.some(scene=>scene.kind==='spoken'&&(src.id==='master'||new RegExp('^s'+String(scene.order).padStart(2,'0')+'_t','i').test(src.id)))).map(src=>src.id):null;
  const transcripts=await transcribeStep(evidence.analysis,whisperCli,whisperModel,{sourceIds});
  events.push(manualScenes&&!sourceIds.length?'visual_takes_no_speech_asr_claimed':'offline_asr_completed');
  const decisions=await plan(evidence.analysis,resolve(brief),join(root,'decisions.json'),mode);
  if(decisions.choices!==requestedBrief.script.length||
   (Array.isArray(decisions.missingBeats)&&decisions.missingBeats.length>0)){
   // Partial preview is NOT a valid MP4. Preserve confident candidates in
   // recovery; only the just-created decision file is removed.
   await rm(decisions.decisions,{force:true});
   throw Error('Incomplete ASR dialogue: '+decisions.choices+' of '+
    requestedBrief.script.length+' beats matched; manual Recovery Review required');
  }
  events.push('dialogue_cuts_proposed');
  let chosenDecisionPath=decisions.decisions;
  let aiEditorial=null;
  if(aiEditorModel!==null){
   if(typeof aiEditorModel!=='string'||!aiEditorModel.trim())fail('Invalid Ollama editor model');
   const currentDecision=JSON.parse(await readFile(decisions.decisions,'utf8'));
   const selected=requestedBrief.manualSource?{...currentDecision,aiEditorial:{version:1,provider:"author-storyboard",model:null,variation:aiVariation,look:"natural-clean",creativeIntent:"Exact author storyboard and mapped visual files; ASR only verifies explicit speech.",changedTakeSelection:false}}:await aiEditorialSelector({
    decisions:currentDecision,brief:requestedBrief,model:aiEditorModel,variation:aiVariation,
   });
   if(!selected?.aiEditorial||!['ollama',...(requestedBrief.manualSource?['author-storyboard']:[])].includes(selected.aiEditorial.provider)||
    !Array.isArray(selected.choices)||selected.choices.length!==requestedBrief.script.length)
    fail('AI selector did not return a verified complete choice sequence');
   chosenDecisionPath=join(root,'decisions.ai.json');
   await writeFile(chosenDecisionPath,JSON.stringify(selected,null,2)+'\n',{flag:'wx'});
   aiEditorial=selected.aiEditorial;
   events.push(requestedBrief.manualSource?'authored_storyboard_preserved_without_creative_regeneration':'real_local_ollama_selected_cut_candidates');
  }
  const assembled=await assemble(chosenDecisionPath,join(root,'timeline.json'));
  events.push('clips_verified_and_timeline_built');
  const subtitleDraft=await writeSubtitleDraft({briefPath:resolve(brief),timelinePath:assembled.project,decisionsPath:chosenDecisionPath,outputDir:root});
  events.push('reviewable_subtitle_sidecars_written');
  const output=join(root,'draft-reel.mp4');
  let subtitleBurnIn=null;
  const renderOutput=burnSubtitles&&subtitleDraft.cues>0&&!aiEditorial?join(root,'draft-reel-clean.mp4'):output;
  await call(process.execPath,[rendererPath,assembled.project,renderOutput]);
  if(burnSubtitles&&subtitleDraft.cues>0&&!aiEditorial){
   subtitleBurnIn=await burnPersonaSubtitles({videoPath:renderOutput,reviewPath:subtitleDraft.reviewPath,outputPath:output,ffmpegDir});
   events.push('subtitles_burned_into_draft_mp4');
  }
  events.push('real_mp4_rendered');
  const qaPath=join(root,'qa.json');
  await call(process.execPath,[verifierPath,output,'persona-first-reel','reel',qaPath]);
  const qa=JSON.parse(await readFile(qaPath,'utf8'));
  validateDraftQa(qa,output);
  events.push('technical_qa_passed');
  const timing=assessFirstReelTiming(requestedBrief,qa);
  if(timing.status==='needs-human-timing-review')events.push('duration_mismatch_requires_human_review');
  let aiFinishedVideo=null,aiColorPackage=null,aiFinishedQaPath=null;
  if(aiEditorial){
   // Actual FFmpeg output in a NEW package. The model chose a direction from
   // the script, but did NOT visually inspect any frame or prove skin neutrality.
   let selected;
   if(visualPreset){
    const grade=await renderVisualPreset({inputPath:output,outputPath:join(root,'directed-color.mp4'),presetId:visualPreset,ffmpegDir});
    selected={path:grade.output.path};
    events.push('validated_director_visual_preset_applied');
   }else{
    const colorPackage=await createColorVariants({inputPath:output,outputDir:join(root,'ai-color-options'),ffmpegDir});
    selected=colorPackage.variants.find(item=>item.id===aiEditorial.look);
    if(!selected)fail('Ollama requested an unavailable safe color grade');
   }
   const finished=join(root,'ai-edited-reel.mp4');
   if(burnSubtitles&&subtitleDraft.cues>0){
    subtitleBurnIn=await burnPersonaSubtitles({videoPath:selected.path,reviewPath:subtitleDraft.reviewPath,outputPath:finished,ffmpegDir,presetId:visualPreset});
    events.push('subtitles_burned_into_ai_finished_mp4');
   }else await copyFile(selected.path,finished,fsConstants.COPYFILE_EXCL);
   const finishedQa=join(root,'ai-edited-qa.json');
   await call(process.execPath,[verifierPath,finished,'persona-ai-reel','reel',finishedQa]);
   const checked=JSON.parse(await readFile(finishedQa,'utf8'));
   validateDraftQa(checked,finished);
   aiFinishedVideo=finished;
   aiColorPackage=visualPreset?join(root,'directed-color.mp4.visual-preset.json'):join(root,'ai-color-options','COMPARISON.json');
   aiFinishedQaPath=finishedQa;
   events.push('real_ffmpeg_color_applied_to_edited_mp4');
   events.push('ai_selected_color_mp4_technical_qa_passed');
  }
  const summary={version:1,status:'awaiting-author-review',mode,events,sourceSelection,output,qaPath,renderProject:assembled.project,decisions:chosenDecisionPath,aiEditorial,
    aiFinishedVideo,aiColorPackage,aiFinishedQaPath,
    briefFingerprintSha256,briefIdeaId:typeof requestedBrief.ideaId==='string'?requestedBrief.ideaId:null,
    subtitleDraft,subtitleBurnIn,visualDirection:visualPreset?getVisualPreset(visualPreset):null,timing,
    warning:requestedBrief.manualSource?'Authored storyboard and mapped files preserved. Speech scenes use real Whisper; visual takes do not claim ASR verification. Whole visual files keep their original music. Caption placement, timing, color and acting require author review.':'Neural ASR and Ollama selected REAL cuts and FFmpeg rendered them. Ollama chose a proposed color direction from SCRIPT ONLY, not visual frame inspection. The real color filter was applied and technically verified. This does NOT certify acting, skin tones, emotional impact, musical appropriateness, captions or author approval. Check timing.status before any approval.',
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
 const [sources,brief,outputDir,whisperCli,whisperModel,ffmpegDir,mode,aiEditorModel,aiVariation]=process.argv.slice(2);
 runFirstReel({sources,brief,outputDir,whisperCli,whisperModel,ffmpegDir,mode:mode??'strict',aiEditorModel:aiEditorModel??null,aiVariation:aiVariation??'cinematic'})
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
