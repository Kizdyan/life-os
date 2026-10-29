#!/usr/bin/env node
/** One-command local speech-aware Persona Reel (draft only; never publishes). */
import { spawn } from 'node:child_process';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, assemble } from './persona-semantic-montage.mjs';
import { transcribe, plan } from './persona-semantic-autoselect.mjs';

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
export async function runFirstReel({sources,brief,outputDir,whisperCli,whisperModel,ffmpegDir,rendererPath=join(home,'persona-timeline-render.mjs'),verifierPath=join(home,'persona-verify-render.mjs'),transcribeStep=transcribe}={}){
 if(![sources,brief,outputDir,whisperCli,whisperModel].every(x=>typeof x==='string'&&x.trim()))fail('Provide sources, brief, new output dir, local whisper-cli, and model paths');
 for(const file of [sources,brief,whisperCli,whisperModel])if(!await exists(resolve(file)))fail('Missing required local file: '+file);
 if(extname(resolve(whisperCli)).toLowerCase()==='.cmd')fail('Batch wrappers are not accepted: supply a native whisper-cli executable');
 temporaryBinPath(ffmpegDir);
 await Promise.all([call('ffmpeg',['-version'],{timeout:8000}),call('ffprobe',['-version'],{timeout:8000})]);
 const root=resolve(outputDir);
 await mkdir(root,{recursive:false});
 const events=[];
 try{
  // One explicitly selected video may replace a hand-written sources.json.
  // Never scan a directory or silently add unrelated private media.
  const input=resolve(sources);
  const singleFile=new Set(['.mp4','.mov','.mkv','.webm','.m4v']).has(extname(input).toLowerCase());
  let sourcesManifest=input;
  if(singleFile){
   sourcesManifest=join(root,'sources.generated.json');
   await writeFile(sourcesManifest,JSON.stringify({version:1,sources:[{id:'single',path:input}]},null,2)+'\n',{flag:'wx'});
   events.push('single_video_manifest_created');
  }
  const evidence=await analyze(sourcesManifest,join(root,'evidence'));
  events.push('media_evidence_generated');
  const transcripts=await transcribeStep(evidence.analysis,whisperCli,whisperModel);
  events.push('offline_asr_completed');
  const decisions=await plan(evidence.analysis,resolve(brief),join(root,'decisions.json'));
  events.push('dialogue_cuts_proposed');
  const assembled=await assemble(decisions.decisions,join(root,'timeline.json'));
  events.push('clips_verified_and_timeline_built');
  const output=join(root,'draft-reel.mp4');
  await call(process.execPath,[rendererPath,assembled.project,output]);
  events.push('real_mp4_rendered');
  const qaPath=join(root,'qa.json');
  await call(process.execPath,[verifierPath,output,'persona-first-reel','reel',qaPath]);
  const qa=JSON.parse(await readFile(qaPath,'utf8'));
  validateDraftQa(qa,output);
  events.push('technical_qa_passed');
  const summary={version:1,status:'awaiting-author-review',events,output,qaPath,renderProject:assembled.project,decisions:decisions.decisions,
    warning:'Offline speech matching is not evaluation of acting, emotion, music or color. Human visual review and publication approval are required.',
    technicalChecks:qa.evidence??null,distributionAllowed:false};
  await writeFile(join(root,'RESULT.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
  return summary;
 }catch(error){
  await writeFile(join(root,'FAILED.json'),JSON.stringify({status:'failed',events,error:String(error.message||error),note:'Partial outputs retained for debugging; originals are not changed.'},null,2)+'\n',{flag:'wx'}).catch(()=>{});
  throw error;
 }
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
 const [sources,brief,outputDir,whisperCli,whisperModel,ffmpegDir]=process.argv.slice(2);
 runFirstReel({sources,brief,outputDir,whisperCli,whisperModel,ffmpegDir}).then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{console.error('Persona first-reel runner:',e.message);process.exitCode=1});
}
