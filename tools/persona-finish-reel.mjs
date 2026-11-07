#!/usr/bin/env node
/**
 * Post-production on the EXISTING verified Persona MP4. No source edits,
 * no automatic style guessing, no uploads and NO publication approval.
 * The author must explicitly review a separate captions.reviewed.srt first.
 */
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {access,copyFile,mkdir,readFile,realpath,stat,writeFile} from 'node:fs/promises';
import {basename,dirname,extname,isAbsolute,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateDraftQa} from './persona-first-reel-runner.mjs';
import {analyzePersonaVideoQuality} from './persona-video-quality.mjs';

const toolHome=dirname(fileURLToPath(import.meta.url));
const fail=message=>{throw Error('Persona finish: '+message)};
const readJson=async path=>JSON.parse(await readFile(path,'utf8'));
async function sha256(path){
 const h=createHash('sha256');
 for await(const chunk of createReadStream(path))h.update(chunk);
 return h.digest('hex');
}
const isHash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/i.test(x);
const number=(x,min,max,label)=>{
 if(typeof x!=='number'||!Number.isFinite(x)||x<min||x>max)fail('Invalid '+label);
 return x;
};
const inside=(parent,child)=>{
 const rel=relative(parent,child);
 return rel===''||(rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel));
};
const millis=text=>{
 const match=/^(\d{2}):([0-5]\d):([0-5]\d),(\d{3})$/.exec(text);
 return match?(Number(match[1])*3600000+Number(match[2])*60000+
  Number(match[3])*1000+Number(match[4])):NaN;
};
/** Enforce a human-created plain SRT, not ASR's provisional sidecar. */
export function validateReviewedSrt(text,durationSec){
 if(typeof text!=='string'||!text.trim()||text.length>128000||text.includes('\uFFFD'))
  fail('Missing, oversized, or invalid reviewed subtitle file');
 const blocks=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim().split(/\n[ \t]*\n/);
 if(!blocks.length||blocks.length>80)fail('Expected 1-80 reviewed subtitle cues');
 let previousEnd=0;
 for(const [index,block] of blocks.entries()){
  const lines=block.split('\n');
  if(lines.length<3||lines.length>4||String(index+1)!==lines[0].trim())
   fail('Invalid subtitle index or more than two lines at cue '+(index+1));
  const match=/^(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})$/.exec(lines[1].trim());
  const start=millis(match?.[1]),end=millis(match?.[2]);
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<previousEnd||end<=start||
     end>durationSec*1000+100)fail('Overlapping or out-of-video subtitles at cue '+(index+1));
  for(const line of lines.slice(2)){
   if(!line.trim()||line.length>42||/[{}\\\u0000-\u001f\u007f]/u.test(line))
    fail('Invalid or styled subtitle text at cue '+(index+1));
  }
  previousEnd=end;
 }
 return {cueCount:blocks.length,lastEndMs:previousEnd};
}
/** Keep the original voice unchanged outside the author's explicit musical cue. */
export function validateMusicCue(selected,seconds,clipDuration){
 const startSec=number(selected?.startSec,0,seconds,'music startSec');
 const endSec=number(selected?.endSec,0,seconds,'music endSec');
 const durationSec=endSec-startSec;
 if(durationSec<0.25)fail('Music cue must have at least 0.25 seconds and start before end');
 const fadeInSec=number(selected.fadeInSec??0.04,0,1,'music fadeInSec');
 const fadeOutSec=number(selected.fadeOutSec??0.18,0,1,'music fadeOutSec');
 if(fadeInSec+fadeOutSec>durationSec)
  fail('Music fades exceed the selected cue duration');
 if(!Number.isFinite(clipDuration)||clipDuration+0.03<durationSec)
  fail('Music file must cover the whole selected cue; never loop or stretch sound implicitly');
 return {startSec,endSec,durationSec,fadeInSec,fadeOutSec,
  volume:number(selected.volume,0,0.3,'music volume'),
  originalVolume:number(selected.originalVolume,0.7,1,'original voice volume')};
}
function envWithMediaTools(ffmpegDir){
 const env={...process.env},key=Object.keys(env).find(k=>k.toLowerCase()==='path')||'PATH';
 if(ffmpegDir)env[key]=resolve(ffmpegDir)+(process.platform==='win32'?';':':')+(env[key]||'');
 return env;
}
function run(bin,args,options={}){
 return new Promise((ok,bad)=>{
  const child=spawn(bin,args,{shell:false,windowsHide:true,
   cwd:options.cwd,env:options.env,stdio:['ignore','pipe','pipe']});
  let stderr='',stdout='',done=false;
  const timer=setTimeout(()=>{if(!done){done=true;child.kill();bad(Error('Timed out: '+bin))}},20*60*1000);
  child.stdout.on('data',data=>{stdout=(stdout+data).slice(-10000)});
  child.stderr.on('data',data=>{stderr=(stderr+data).slice(-10000)});
  child.on('error',error=>{if(!done){done=true;clearTimeout(timer);bad(error)}});
  child.on('close',code=>{if(done)return;done=true;clearTimeout(timer);
   code===0?ok(stdout):bad(Error('Process '+basename(bin)+' exited '+code+': '+stderr.slice(-4000)))});
 });
}
export async function preflightFinish({draftDir,optionsPath,outputDir,ffmpegDir}={}){
 if(![draftDir,optionsPath,outputDir].every(p=>typeof p==='string'&&p.trim()))
  fail('Usage: <existing-draft-dir> <finish-options.json> <NEW-output-dir> [ffmpeg-bin-dir]');
 const root=await realpath(resolve(draftDir)),output=resolve(outputDir);
 const resolvedParent=await realpath(dirname(output));
 if(inside(root,output)||inside(root,join(resolvedParent,basename(output))))
  fail('Output must be outside the existing draft folder');
 await access(output).then(()=>fail('Output folder already exists'),e=>{if(e.code!=='ENOENT')throw e});
 const options=await readJson(resolve(optionsPath));
 if(options?.version!==1||options.kind!=='persona-finish-choices-v1'||
    options.publicationApproved!==false||options.captionsReviewed!==true||
    !isHash(options.sourceSha256)||typeof options.captionsPath!=='string')
  fail('Explicit, unpublished finishing choices and reviewed captions required');
 const result=await readJson(join(root,'RESULT.json'));
 const input=join(root,'draft-reel.mp4'),qaPath=join(root,'qa.json');
 if(result?.version!==1||result.status!=='awaiting-author-review'||
   result.distributionAllowed!==false||
   resolve(result.output||'')!==input||resolve(result.qaPath||'')!==qaPath||
   !isHash(result.briefFingerprintSha256)||typeof result.briefIdeaId!=='string'||
   !result.events?.includes('technical_qa_passed'))
  fail('Expected an unchanged unpublished Persona draft with brief fingerprint');
 const qa=await readJson(qaPath);validateDraftQa(qa,input);
 const actualSha=await sha256(input);
 if(actualSha!==qa.evidence.sha256||actualSha!==options.sourceSha256)
  fail('Draft MP4 changed or is not the one selected for finishing');
 const seconds=qa.evidence.durationSec;
 const captionFile=await realpath(resolve(options.captionsPath));
 if(basename(captionFile)!=='captions.reviewed.srt'||
    resolve(captionFile)===join(root,'captions.draft.srt'))
  fail('Select a separate, explicitly reviewed captions.reviewed.srt, not a draft');
 const captionStats=await stat(captionFile);
 if(!captionStats.isFile()||captionStats.size<8||captionStats.size>128000)
  fail('Invalid reviewed caption size');
 const decoder=new TextDecoder('utf-8',{fatal:true});
 const captionText=decoder.decode(await readFile(captionFile));
 const captionQa=validateReviewedSrt(captionText,seconds);
 const color=options.color??{brightness:0,contrast:1,saturation:1};
 if(!color||typeof color!=='object')fail('Invalid color settings');
 const grade={
  brightness:number(color.brightness,-0.05,0.05,'brightness'),
  contrast:number(color.contrast,0.92,1.08,'contrast'),
  saturation:number(color.saturation,0.88,1.12,'saturation')
 };
 let music=null;
 if(options.music!==undefined&&options.music!==null){
  const selected=options.music;
  if(typeof selected?.path!=='string'||selected.rightsConfirmed!==true)
   fail('An added soundtrack requires explicit rights confirmation');
  const path=await realpath(resolve(selected.path));
  if(!new Set(['.mp3','.m4a','.wav','.aac','.flac','.ogg']).has(extname(path).toLowerCase())||
     path===input||path===captionFile)fail('Unsupported soundtrack path');
  const st=await stat(path);
  if(!st.isFile()||st.size<256||st.size>250*1024*1024)fail('Invalid soundtrack size');
  const probe=JSON.parse(await run('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type','-of','json',path],
   {env:envWithMediaTools(ffmpegDir)}));
  if(!probe.streams?.some(s=>s.codec_type==='audio'))
   fail('Music requires a real audio stream');
  const cue=validateMusicCue(selected,seconds,Number(probe.format?.duration));
  music={path,sha256:await sha256(path),...cue};
 }
 return {root,output,input,result,qa,options,captionFile,captionQa,grade,music,sourceSha256:actualSha,
  captionSha256:await sha256(captionFile)};
}
export async function finishPersonaReel({draftDir,optionsPath,outputDir,ffmpegDir,
 verifierPath=join(toolHome,'persona-verify-render.mjs'),qualityAnalyzer=analyzePersonaVideoQuality}={}){
 const plan=await preflightFinish({draftDir,optionsPath,outputDir,ffmpegDir});
 const env=envWithMediaTools(ffmpegDir);
 const filters=await run('ffmpeg',['-hide_banner','-filters'],{env});
 if(!/^\s*\.{3}\s+subtitles\s/m.test(filters)&&!/subtitles\s+V->V/.test(filters))
  fail('FFmpeg subtitles/libass filter unavailable; install FFmpeg with libass');
 await mkdir(plan.output,{recursive:false});
 const stages=[];
 try{
  const localSrt=join(plan.output,'captions.reviewed.srt');
  await copyFile(plan.captionFile,localSrt);
  stages.push('reviewed-captions-copied-without-editing');
  const movie=join(plan.output,'finished-candidate.mp4');
  const color='eq=brightness='+plan.grade.brightness+':contrast='+plan.grade.contrast+
   ':saturation='+plan.grade.saturation;
  const subtitle="subtitles=filename=captions.reviewed.srt:force_style='Fontname=Arial,Fontsize=18,Outline=2,Shadow=0,MarginV=180,Alignment=2'";
  const args=['-hide_banner','-nostdin','-loglevel','error','-n','-i',plan.input];
  if(plan.music)args.push('-i',plan.music.path);
  args.push('-vf',color+','+subtitle);
  if(plan.music){
   const cue=plan.music;
   // Position relative to the final Reel, not the original music file.
   const musicFilters=['atrim=start=0:duration='+cue.durationSec,'asetpts=PTS-STARTPTS',
    'volume='+cue.volume];
   if(cue.fadeInSec>0)musicFilters.push('afade=t=in:st=0:d='+cue.fadeInSec);
   if(cue.fadeOutSec>0)musicFilters.push('afade=t=out:st='+(cue.durationSec-cue.fadeOutSec)+':d='+cue.fadeOutSec);
   musicFilters.push('adelay='+Math.round(cue.startSec*1000)+':all=1');
   // A 0.9 voice volume must NOT lower the original soundtrack for the entire Reel.
   const voiceVolume="volume='if(between(t,"+cue.startSec+','+cue.endSec+'),'+cue.originalVolume+",1)':eval=frame";
   const graph='[0:a]'+voiceVolume+'[voice];[1:a]'+musicFilters.join(',')+
    '[music];[voice][music]amix=inputs=2:duration=first:normalize=0,'+
    'alimiter=limit=0.95:level=0[a]';
   args.push('-filter_complex',graph,'-map','0:v:0','-map','[a]');
  }else args.push('-map','0:v:0','-map','0:a:0');
  args.push('-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p',
   '-c:a','aac','-ar','48000','-b:a','192k','-movflags','+faststart',
   '-t',String(plan.qa.evidence.durationSec),movie);
  await run('ffmpeg',args,{cwd:plan.output,env});
  stages.push('reviewed-srt-burned-into-new-mp4');
  if(plan.music)stages.push('explicit-timed-licensed-music-with-fades-and-local-voice-ducking');
  stages.push('explicit-bounded-color-adjustments-only');
  const qaPath=join(plan.output,'finish-qa.json');
  await run(process.execPath,[resolve(verifierPath),movie,'persona-finish-candidate','reel',qaPath],{env});
  const qa=await readJson(qaPath);validateDraftQa(qa,movie);
  if(Math.abs(qa.evidence.durationSec-plan.qa.evidence.durationSec)>0.25)
   fail('Post-processing changed the Reel duration unexpectedly');
  stages.push('real-ffmpeg-technical-qa-passed-no-publication');
  const qualityPath=join(plan.output,'video-quality.json');
  const quality=await qualityAnalyzer({videoPath:movie,subtitlePath:localSrt,
   expectedDurationSec:plan.qa.evidence.durationSec,outputPath:qualityPath,ffmpegDir,
   timelinePath:join(plan.root,'draft-reel.mp4.persona.json'),timelineSourceVideoPath:plan.input});
  if(quality?.video?.sha256!==qa.evidence.sha256||quality?.publicationApproved!==false||
    quality?.distributionAllowed!==false)fail('Local video-quality report does not match the unpublished finished MP4');
  stages.push('local-video-quality-analysis-written');
  const report={version:1,kind:'persona-finished-candidate-v1',
   status:'awaiting-author-review',publicationApproved:false,distributionAllowed:false,
   briefIdeaId:plan.result.briefIdeaId,
   briefFingerprintSha256:plan.result.briefFingerprintSha256,
   originalDraft:plan.input,originalSha256:plan.sourceSha256,
   output:movie,qaPath,qualityPath,outputSha256:qa.evidence.sha256,
   captions:{path:localSrt,sourceSha256:plan.captionSha256,cueCount:plan.captionQa.cueCount,
    burnedIn:true,source:'explicit-human-reviewed-srt'},
   color:plan.grade,music:plan.music?{sha256:plan.music.sha256,
    volume:plan.music.volume,originalVolume:plan.music.originalVolume,
    startSec:plan.music.startSec,endSec:plan.music.endSec,
    fadeInSec:plan.music.fadeInSec,fadeOutSec:plan.music.fadeOutSec,
    rightsConfirmedByAuthor:true}:null,
   stages,
   caveat:'Technical QA and subtitle filter success do not assess acting, color perception, lip sync, music balance, or subtitle placement. Watch the entire new MP4 before any approval.'};
  await writeFile(join(plan.output,'FINISH-RESULT.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  await writeFile(join(plan.output,'FINISH-RESULT.md'),[
   '# Persona · проверочный финализированный Reels','','**Готов для личного просмотра, НЕ для публикации.**','',
   '- Видео: '+movie,'- QA: '+qaPath,
   '- Субтитры: встроены в новое MP4 из отдельно просмотренного SRT',
   '- Цвет: только явные ограниченные настройки автора',
   '- Музыка: '+(plan.music?'только '+plan.music.startSec+'–'+plan.music.endSec+' с, с авторским выбором и затуханиями':'не добавлялась'),'',
   'Просмотри все 7 кадров: мимику, глаза, очки, цвет кожи, клавиши, переходы,',
   'разборчивость речи, музыку, читаемость и синхронизацию субтитров.',
   'Затем утверди или отправь на доработку. Публикация заблокирована.',''
  ].join('\n'),{flag:'wx'});
  return report;
 }catch(error){
  await writeFile(join(plan.output,'FAILED.json'),JSON.stringify({status:'failed',
   stages,error:String(error.message||error),
   note:'Original, previously rendered MP4 and reviewed captions remain untouched.'},null,2)+'\n',{flag:'wx'}).catch(()=>{});
  throw error;
 }
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
 const [draftDir,optionsPath,outputDir,ffmpegDir]=process.argv.slice(2);
 finishPersonaReel({draftDir,optionsPath,outputDir,ffmpegDir})
  .then(r=>console.log(JSON.stringify(r,null,2)))
  .catch(e=>{console.error(e.message);process.exitCode=1});
}
