
import {spawn} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename,join,resolve} from 'node:path';
import {detectAccents} from './persona-audio-cuts.mjs';
import {analyzePersonaVideoQuality} from './persona-video-quality.mjs';
import {runStudioPython} from './persona-studio-python.mjs';
import {personaMediaPaths,PRODUCTION_LUT_MIX} from './persona-media-paths.mjs';
import {planFraming} from './persona-studio-framing.mjs';
import {cachedFfmpegStage,cachedMp4,stageCacheEnabled,stageFileSha} from './persona-stage-cache.mjs';
import {fileURLToPath} from 'node:url';

import {buildSubtitleAss,loadSubtitlePreset,verifySubtitleFont} from './persona-subtitle-burn.mjs';

export const musicFormats = JSON.parse(await readFile(new URL('../packages/core/src/persona-music-formats.json', import.meta.url),'utf8'));
const dynamicSoft = JSON.parse(await readFile(new URL('./studio-emotion-matrix.json', import.meta.url),'utf8')).dynamic;
export function audioMode(value) {
 if (value === undefined || value === false) return 'original';
 if (value === true) return 'auto';
 throw Error('Автоподбор музыки должен быть включён или выключен.');
}

class NoMusicalCandidate extends Error {}

export function visualMusicCandidate(formatId, duration) {
 const format = musicFormats.find(item=>item.id===formatId);
 if (format?.id !== 'Format_OneEmotion')
  throw Error('Для этого формата нужен подтверждённый звуковой материал.');
 const endSec = Math.floor(Math.min(duration, format.maxSec)*30)/30;
 if (!Number.isFinite(endSec) || endSec < format.minSec)
  throw Error('Видеофрагмент слишком короткий для этого формата.');
 return {version:1,format,candidates:[{id:'fragment-1',startSec:0,endSec,evidence:'visual-duration'}],
  accents:[],silences:[],harmonicChanges:[],evidence:'Фрагмент выбран по длительности видео.'};
}

const sampleRate = 11025;
const step = .25;
const n = 4096;

function chroma(samples, at) {
 const real = new Float64Array(n), imaginary = new Float64Array(n);
 for (let i=0,j=0;i<n;i++) {
  real[j] = (samples[at+i] ?? 0) * (.5-.5*Math.cos(2*Math.PI*i/n));
  let mask = n>>1;
  for (;j&mask;mask>>=1) j^=mask;
  j^=mask;
 }
 for(let span=2;span<=n;span*=2) {
  for(let k=0;k<span/2;k++) {
   const x=Math.cos(-2*Math.PI*k/span), y=Math.sin(-2*Math.PI*k/span);
   for(let a=k;a<n;a+=span) {
    const b=a+span/2, u=real[b]*x-imaginary[b]*y, v=real[b]*y+imaginary[b]*x;
    real[b]=real[a]-u; imaginary[b]=imaginary[a]-v;
    real[a]+=u; imaginary[a]+=v;
   }
  }
 }
 const profile=Array(12).fill(0);
 const energy=real.map((x,i)=>x*x+imaginary[i]*imaginary[i]);
 for(let i=24;i<299;i++) {
  if(energy[i]<=energy[i-1]||energy[i]<=energy[i+1])continue;
  const midi=Math.round(69+12*Math.log2(i*sampleRate/n/440));
  profile[((midi%12)+12)%12]+=energy[i];
 }
 const sum=profile.reduce((a,b)=>a+b,0);
 return sum?profile.map(x=>x/sum):profile;
}

export function analyzeMusicCandidates(samples, formatId) {
 const format=musicFormats.find(item=>item.id===formatId);
 if(!format)throw Error('Выберите один из пяти форматов.');
 if(format.missing)throw Error(format.missing);
 const duration=samples.length/sampleRate;
 if(duration<format.minSec||duration>900)throw Error('Для этого формата нужна подходящая длительность видео, максимум 15 минут.');
 const windows=[];
 for(let start=0;start+step<=duration+.001;start+=step) {
  const segment=samples.subarray(Math.round(start*sampleRate),Math.round((start+step)*sampleRate));
  const rms=Math.sqrt(segment.reduce((energy,sample)=>energy+sample*sample,0)/segment.length);
  windows.push({start,rms});
 }
 const floor=Math.max(.003,windows.reduce((peak,point)=>Math.max(peak,point.rms),0)*.045);
 const silences=[], harmonicChanges=[];
 let previous=null;
 for(const window of windows) {
  if(window.rms<floor) {
   const last=silences.at(-1);
   if(last?.endSec===window.start)last.endSec+=step;
   else silences.push({startSec:window.start,endSec:window.start+step});
   previous=null;
   continue;
  }
  window.profile=chroma(samples, Math.max(0,Math.round(window.start*sampleRate)-512));
  if(previous) {
   const distance=window.profile.reduce((sum,value,i)=>sum+Math.abs(value-previous[i]),0)/2;
   if(distance>.45)harmonicChanges.push({timeSec:window.start,strength:Number(distance.toFixed(3))});
  }
  previous=window.profile;
 }
 const accents=detectAccents(samples);
 const active=windows.filter(window=>window.profile&&Math.max(...window.profile)>.14);
 if(active.length<4)throw new NoMusicalCandidate('Не найден подтверждённый музыкальный фрагмент в звуковой дорожке.');
 const timedAccents=accents.filter(a=>active.some(w=>a.timeSec>=w.start-.12&&a.timeSec<w.start+step));
 const anchors=[...new Set([active[0].start,...silences.filter(x=>x.endSec-x.startSec>=.4&&x.endSec<duration)
  .map(x=>x.endSec),...harmonicChanges.map(x=>x.timeSec)])];
 const toFrame=(time)=>Math.round(time*30)/30;
 const proposals=[];
 for(const anchor of anchors) {
  const opening=timedAccents.find(a=>Math.abs(a.timeSec-anchor)<=.22)?.timeSec??anchor;
  const start=toFrame(Math.max(0,opening-.25));
  const bound=Math.min(duration,start+format.maxSec);
  const endings=silences.filter(s=>s.startSec>=start+format.minSec&&s.startSec+.2<=bound);
  const endingsAtAccent=timedAccents.filter(a=>a.timeSec>=start+format.minSec&&a.timeSec<=bound&&bound-a.timeSec<1.2);
  const tail=endings.at(-1);
  // A following onset can delimit a complete phrase when there is no quiet tail.
  const phraseEnd=tail?tail.startSec+.2:(endingsAtAccent.at(-1)?.timeSec??bound);
  const end=Math.floor(phraseEnd*30)/30;
  if(end-start+1e-7<format.minSec)continue;
  const fragment=active.filter(w=>w.start>=start&&w.start<end);
  if(fragment.length*step<(end-start)*.35)continue;
  if(format.id==='Format_MomentOfBirth'&&anchor!==active[0].start&&
     !silences.some(s=>Math.abs(s.endSec-anchor)<.3&&s.endSec-s.startSec>=.4))continue;
  if(format.id==='Format_OneNote'){
   const root=fragment[0].profile.indexOf(Math.max(...fragment[0].profile));
   if(fragment.filter(w=>w.profile[root]>.79).length<fragment.length*.85)continue;
  }
  const localAccents=timedAccents.filter(a=>a.timeSec>=start&&a.timeSec<end);
  const changes=harmonicChanges.filter(a=>a.timeSec>=start&&a.timeSec<end);
  if(format.id==='Format_OneEmotion') {
   const original=windows.filter(w=>w.start>=start&&w.start<end).map(w=>w.rms);
   if(Math.max(...original)-Math.min(...original)<.015)continue;
  }
  proposals.push({startSec:start,endSec:end,accentSec:localAccents.map(a=>a.timeSec),
   harmonicChangeSec:changes.map(a=>a.timeSec),strength:localAccents.reduce((total,a)=>total+a.strength,0)/(end-start)});
 }
 const candidates=[];
 for(const candidate of proposals.sort((a,b)=>b.strength-a.strength||a.startSec-b.startSec)){
  if(candidates.some(item=>Math.abs(item.startSec-candidate.startSec)<2))continue;
  candidates.push({...candidate,id:'fragment-'+(candidates.length+1)});
  if(candidates.length===3)break;
 }
 if(!candidates.length)throw new NoMusicalCandidate(format.id==='Format_OneNote'?'Не удалось подтвердить одну отчётливо изолированную ноту.':
  'Не найден музыкальный фрагмент с достаточной длительностью и динамикой для этого формата.');
 return {version:1,format,candidates,accents:timedAccents,silences,harmonicChanges,
  evidence:'Эвристики энергии и хрома-профиля. Изменение тонального состава не определяет аккорд, эмоцию или качество исполнения.'};
}

function ffmpegBinary(config){
 const name=process.platform==='win32'?'ffmpeg.exe':'ffmpeg';
 return config.ffmpegDir?join(config.ffmpegDir,name):name;
}
function ffmpeg(args,config,{cwd,max=1024*1024,timeout=180000}={}) {
 return new Promise((ok,no)=>{
  const child=spawn(ffmpegBinary(config),['-nostdin',...args],
   {cwd,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let size=0,err='',failure;
  const parts=[];
  const timer=setTimeout(()=>{failure=Error('FFmpeg: время обработки истекло.');child.kill()},timeout);
  child.stdout.on('data',chunk=>{
   size+=chunk.length;
   if(size>max){failure=Error('Превышен предел аудиоанализа.');child.kill()}
   else parts.push(chunk);
  });
  child.stderr.on('data',chunk=>err=(err+chunk).slice(-16000));
  child.once('error',error=>{clearTimeout(timer);no(error)});
  child.once('close',code=>{
   clearTimeout(timer);
   if(failure||code!==0)no(failure??Error('FFmpeg: '+err));
   else ok({stdout:Buffer.concat(parts),stderr:err});
  });
 });
}
async function hash(path){
 const output=createHash('sha256');
 for await(const part of createReadStream(path))output.update(part);
 return output.digest('hex');
}

export async function analyzeMusicMaster(path, formatId, config, media) {
 if (media && !media.audioCodecs.length) return visualMusicCandidate(formatId, media.duration);
 const env={...process.env,...config.apiEnv};
 const recipe=stageCacheEnabled(env)?await stageFileSha(fileURLToPath(import.meta.url)):null;
 const result=await cachedFfmpegStage(path,'music_master_analysis',
  {formatId,formats:musicFormats,sampleRate,duration:media?.duration??null,recipe},
  ()=>analyzeMusicAudio(path,formatId,config,media),
  {env,binary:ffmpegBinary(config),valid:value=>Array.isArray(value?.candidates)});
 return result.value;
}

async function analyzeMusicAudio(path,formatId,config,media){
 const {stdout:raw}=await ffmpeg(['-v','error','-xerror','-protocol_whitelist','file','-format_whitelist','mov,matroska,webm','-i',path,'-map','0:a:0','-t','900','-ac','1','-ar',String(sampleRate),
  '-f','f32le','pipe:1'], config, {max:sampleRate*900*4});
 const samples=new Float32Array(raw.length/4);
 for(let i=0;i<samples.length;i++)samples[i]=raw.readFloatLE(i*4);
 try {return analyzeMusicCandidates(samples,formatId);}
 catch (error) {
  if (media && formatId==='Format_OneEmotion' && error instanceof NoMusicalCandidate)
   return visualMusicCandidate(formatId,media.duration);
  throw error;
 }
}

async function chooseAutoMusic(input, candidate, output, config) {
 const env=config.apiEnv??process.env;
 const script='./studio_music_matching.py';
 const args=[input,'--placeholder-dir',output,'--interval',String(candidate.startSec),String(candidate.endSec)];
 if(env.PERSONA_MUSIC_FALLBACK)args.push('--fallback',resolve(personaMediaPaths(env).root,env.PERSONA_MUSIC_FALLBACK));
 let choice;
 try {
  choice=await runStudioPython(config,script,args,85000);
 } catch(error) {
  if(error.code!=='ETIMEDOUT')throw error;
  choice=await runStudioPython(config,script,[...args,'--offline'],15000);
 }
 if(typeof choice.track!=='string'||typeof choice.file!=='string'||!['sad','epic','dynamic','calm'].includes(choice.mood))
  throw Error('Emotion Agent вернул некорректный результат.');
 return choice;
}

export function musicPictureFilters(media,framing,profile,learned){
 const width=media.displayWidth??media.width,height=media.displayHeight??media.height;
 const normalize=`scale=${width}:${height},setsar=1,`;
 const viewport=framing.mode==='face-crop'?`format=yuv444p,crop=${
  [framing.rect[2],framing.rect[3],framing.rect[0],framing.rect[1]].join(':')},scale=1080:1920,`:
  'scale=1080:1920:force_original_aspect_ratio=decrease:force_divisible_by=2,';
 const grade=profile==='Dynamic Soft'?`eq=saturation=${dynamicSoft.saturation}:contrast=${dynamicSoft.contrast},`:'';
 return [
  '[0:v]fps=30,'+normalize+viewport+'format=yuv444p,split[original][lutInput]',
  '[lutInput]lut3d=file=humble.cube,'+grade+(learned?.grade??'')+'format=yuv444p[graded]',
  '[graded][original]blend=all_mode=normal:all_opacity='+PRODUCTION_LUT_MIX+','+
   'pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1',
 ];
}

export async function renderMusicCandidate({input,sourceSha256,analysis,candidate,output,config,media,mode='original',captionStyle='cinematic',learned}){
 const lut=config.musicLut;
 if(!lut)throw Error('Укажите файл Humble LUT в локальных настройках Worker.');
 if(await hash(input)!==sourceSha256)throw Error('Копия исходника изменилась после анализа.');
 const preset=learned?.preset??captionStyle;
 const {style,fontPath}=await loadSubtitlePreset(preset);
 await copyFile(lut,join(output,'humble.cube'));
 await mkdir(join(output,'fonts'));
 await copyFile(fontPath,join(output,'fonts',basename(fontPath)));
 const video=join(output,'music-reel.mp4'), qaPath=join(output,'VIDEO-QUALITY.json');
 const duration=candidate.endSec-candidate.startSec, hookEnd=Math.min(learned?.hookSeconds??2.4,duration*.5);
 const [track,framing]=await Promise.all([mode==='auto'?chooseAutoMusic(input,candidate,output,config):null,
  planFraming(input,candidate,media,config)]);
 const fallback=track?.provider==='local-fallback'?dynamicSoft:null;
 const mix=PRODUCTION_LUT_MIX;
 const profile=fallback?'Dynamic Soft':null;
 const captions=buildSubtitleAss({cues:[{text:analysis.format.hook,startMs:0,endMs:Math.round(hookEnd*1000),
  ...(fallback?.titleMotion==='zoom'?{kinetic:true}:{})}],
  width:1080,height:1920,reference:style,preset,typography:learned?.typography});
 await writeFile(join(output,'hook.ass'),captions.ass,{flag:'wx'});
 const durationArg=duration.toFixed(6);
 const hasCamera=media.audioCodecs.length>0;
 const inputs=['-ss',candidate.startSec.toFixed(6),'-protocol_whitelist','file',
  '-format_whitelist','mov,matroska,webm','-i',input];
 const camera='[0:a:0]aresample=async=1:first_pts=0,apad';
 const filters=musicPictureFilters(media,framing,profile,learned);
 filters[2]+=',ass=filename=hook.ass:fontsdir=fonts[picture]';
 if(track){
  inputs.push('-stream_loop','-1','-protocol_whitelist','file','-i',track.track);
  const bed='[1:a:0]atrim=duration='+durationArg+',asetpts=PTS-STARTPTS,'+
   'loudnorm=I='+ (hasCamera?-20:fallback?.targetLufs??-17) +':TP=-2:LRA=7,aresample=48000,'+
   'afade=t=in:d=0.25,afade=t=out:st='+(duration-.8).toFixed(6)+':d=0.8';
  if(hasCamera)filters.push(camera+'[camera]',bed+'[bed]',
    '[camera][bed]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.9:level=0:latency=1[audio]');
  else filters.push(bed+'[audio]');
 }else if(hasCamera)filters.push(camera+'[audio]');
 else filters.push('anullsrc=r=48000:cl=stereo[audio]');
 const color=['-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709'];
 const exportArgs=['-hide_banner','-nostats','-xerror','-n',...inputs,
  '-map','[picture]','-map','[audio]','-t',durationArg,'-filter_complex',filters.join(';'),
  '-c:v','libx264','-preset','fast','-crf','17','-pix_fmt','yuv420p',
  '-map_metadata','-1',...color,
  '-c:a','aac','-b:a','256k','-movflags','+faststart'];
 const env={...process.env,...config.apiEnv};
 const copiedLut=join(output,'humble.cube'),copiedFont=join(output,'fonts',basename(fontPath));
 const params=stageCacheEnabled(env)?{
  args:exportArgs.map((value,index)=>exportArgs[index-1]==='-i'?'input':value),
  music:track?await stageFileSha(track.track):null,lut:await stageFileSha(copiedLut),
  font:await stageFileSha(copiedFont),ass:await stageFileSha(join(output,'hook.ass')),
 }:null;
 const verifyVideo=async()=>{
  const qa=await analyzePersonaVideoQuality({videoPath:video,expectedDurationSec:duration,outputPath:qaPath,ffmpegDir:config.ffmpegDir});
  if(qa.video.width!==1080||qa.video.height!==1920||qa.video.codec!=='h264'||qa.video.audioCodec!=='aac'||
    qa.findings.find(item=>item.id==='decode_integrity')?.measurement?.value!=='pass'||
    Math.abs(qa.video.durationSec-duration)>.1)throw Error('MP4 не прошёл проверку декодирования, длительности или формата.');
  return qa;
 };
 let qa;
 await cachedMp4({path:video,sourceSha:sourceSha256,params,env,binary:ffmpegBinary(config),render:async()=>{
  const exportLog=await ffmpeg([...exportArgs,video],config,{cwd:output});
  verifySubtitleFont(exportLog.stderr,fontPath);
  if(params&&(await stageFileSha(input)!==sourceSha256||
    (track&&await stageFileSha(track.track)!==params.music)))throw Error('Входные файлы изменились при рендере.');
  qa=await verifyVideo();
 }});
 if(params&&track&&await stageFileSha(track.track)!==params.music)throw Error('Музыкальный трек изменился при рендере.');
 qa??=await verifyVideo();
 if(await hash(input)!==sourceSha256)throw Error('Копия исходника изменилась при рендере.');
 const report={version:1,status:'awaiting-author-review',format:{id:analysis.format.id,version:analysis.format.version},
  source:{sha256:sourceSha256},selection:candidate,selectionConfirmed:true,video:qa.video,qaPath,framing,
  profile,captionStyle,...(learned?{reference:{sha256:learned.sha256,sourceUrl:learned.sourceUrl,settings:learned.typography}}:{}),
  lut:{name:'Humble',mix,sha256:await hash(join(output,'humble.cube'))},
  font:{name:style.fontFamily,style:style.fontStyle,sha256:style.fontSha256},music:track?'auto-selected':hasCamera?'source-audio':'silence',
  audio:{mode,source:hasCamera?'camera':'silence',...(track?{music:{file:track.file,mood:track.mood,model:track.model,
   provider:track.provider,selection:track.selection,warning:track.warning,visionWarning:track.visionWarning,
   visionCache:track.visionCache,sampleTimes:track.sampleTimes,reason:track.reason}}:{})},hooks:[{startSec:0,endSec:hookEnd,text:analysis.format.hook}],
  publicationApproved:false,distributionAllowed:false};
 await writeFile(join(output,'RESULT.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 return report;
}
