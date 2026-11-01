#!/usr/bin/env node
/**
 * Local, non-destructive quality evidence for one rendered MP4.
 * It records measurements and risks; it never judges performance or approves publication.
 */
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {access,mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const fail=message=>{throw Error('Persona video quality: '+message)};
const hash=async path=>{const h=createHash('sha256');for await(const c of createReadStream(path))h.update(c);return h.digest('hex')};
const timecode=seconds=>{
 const value=Math.max(0,Number(seconds)||0),hours=Math.floor(value/3600),minutes=Math.floor(value%3600/60),rest=value%60;
 return [hours,minutes,Math.floor(rest)].map(v=>String(v).padStart(2,'0')).join(':')+'.'+String(Math.round((rest%1)*1000)).padStart(3,'0');
};
const rational=value=>{
 const [a,b='1']=String(value||'').split('/').map(Number);
 return Number.isFinite(a)&&Number.isFinite(b)&&b!==0?a/b:NaN;
};
function mediaEnv(ffmpegDir){
 const env={...process.env},key=Object.keys(env).find(name=>name.toLowerCase()==='path')||'PATH';
 if(ffmpegDir){
  if(typeof ffmpegDir!=='string'||!ffmpegDir.trim())fail('ffmpegDir must be a non-empty path');
  env[key]=resolve(ffmpegDir)+(process.platform==='win32'?';':':')+(env[key]||'');
 }
 return env;
}
function run(bin,args,{timeoutMs=120000,env}={}){
 return new Promise((ok,bad)=>{
  const child=spawn(bin,args,{shell:false,windowsHide:true,env,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='',closed=false;
  const timer=setTimeout(()=>{if(!closed){closed=true;child.kill();bad(Error('Timed out: '+bin))}},timeoutMs);
  child.stdout.on('data',chunk=>{stdout=(stdout+chunk).slice(-500000)});
  child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-500000)});
  child.on('error',error=>{if(!closed){closed=true;clearTimeout(timer);bad(error)}});
  child.on('close',code=>{if(closed)return;closed=true;clearTimeout(timer);
   code===0?ok({stdout,stderr}):bad(Error(bin+' exited '+code+': '+stderr.slice(-3000)))});
 });
}
const finding=(id,status,title,detail,timecodes=[],measurement=undefined)=>({id,status,title,detail,timecodes,...(measurement===undefined?{}:{measurement})});
const cleanFinding=x=>x;
function parseIntervals(log,kind){
 const intervals=[],start=kind==='black'?/black_start:([0-9.]+)/g:kind==='freeze'?/freeze_start: ([0-9.]+)/g:/silence_start: ([0-9.]+)/g;
 const end=kind==='black'?/black_end:([0-9.]+) black_duration:([0-9.]+)/g:kind==='freeze'?/freeze_end: ([0-9.]+)/g:/silence_end: ([0-9.]+) \| silence_duration: ([0-9.]+)/g;
 const starts=[...log.matchAll(start)].map(m=>Number(m[1]));
 for(const match of log.matchAll(end)){
  const endSec=Number(match[1]),durationSec=Number(match[2]);
  if(Number.isFinite(endSec)&&Number.isFinite(durationSec))intervals.push({startSec:Math.max(0,endSec-durationSec),endSec,durationSec});
 }
 if(kind==='freeze'&&starts.length){
  const ends=[...log.matchAll(/freeze_end: ([0-9.]+)/g)].map(match=>Number(match[1])).filter(Number.isFinite);
  for(const startSec of starts){const endSec=ends.find(value=>value>=startSec)??null;intervals.push({startSec,endSec,durationSec:endSec===null?null:endSec-startSec})}
 }else if(!intervals.length&&starts.length)for(const startSec of starts)intervals.push({startSec,endSec:null,durationSec:null});
 return intervals;
}
function parseSrt(text,durationSec){
 const blocks=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim().split(/\n[ \t]*\n/).filter(Boolean);
 const cue=[],problems=[];let previousEnd=-1;
 const ms=value=>{const m=/(\d{2}):(\d{2}):(\d{2}),(\d{3})/.exec(value||'');return m?(+m[1]*3600+ +m[2]*60+ +m[3]+ +m[4]/1000):NaN};
 for(const [index,block] of blocks.entries()){
  const lines=block.split('\n'),match=/^(.+) --> (.+)$/.exec(lines[1]?.trim()||'');
  const start=ms(match?.[1]),end=ms(match?.[2]),captionLines=lines.slice(2);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start){problems.push({id:'subtitle_invalid_time',cue:index+1});continue}
  if(start<previousEnd)problems.push({id:'subtitle_overlap',cue:index+1,startSec:start,endSec:end});
  if(end>durationSec+0.1)problems.push({id:'subtitle_outside_video',cue:index+1,startSec:start,endSec:end});
  if(captionLines.length>2)problems.push({id:'subtitle_too_many_lines',cue:index+1,startSec:start,endSec:end});
  for(const line of captionLines)if(line.length>42)problems.push({id:'subtitle_line_too_long',cue:index+1,startSec:start,endSec:end,characters:line.length});
  cue.push({index:index+1,startSec:start,endSec:end,lines:captionLines.length,maxLineLength:Math.max(0,...captionLines.map(line=>line.length))});
  previousEnd=Math.max(previousEnd,end);
 }
 return {cueCount:cue.length,cues:cue,problems};
}
async function scan(path,args,env){
 const result=await run('ffmpeg',['-hide_banner','-nostdin','-i',path,...args,'-f','null','-'],{env});
 return result.stderr+'\n'+result.stdout;
}
async function visualEvidence({videoPath,durationSec,outputPath,env}){
 if(!outputPath)return null;
 const root=join(dirname(resolve(outputPath)),'visual-evidence');
 await mkdir(root,{recursive:false});
 const moments=[0,Math.max(0,durationSec/2),Math.max(0,durationSec-.05)];
 const frames=[];
 for(const [index,atSec] of moments.entries()){
  const path=join(root,'frame-'+String(index+1).padStart(2,'0')+'.jpg');
  await run('ffmpeg',['-hide_banner','-nostdin','-loglevel','error','-ss',String(atSec),'-i',videoPath,'-frames:v','1','-vf','scale=320:-2','-q:v','3',path],{env});
  frames.push({atSec,timecode:timecode(atSec),path});
 }
 const contactSheetPath=join(root,'contact-sheet.jpg');
 await run('ffmpeg',['-hide_banner','-nostdin','-loglevel','error','-i',join(root,'frame-%02d.jpg'),'-vf','tile=3x1:padding=4:margin=4','-frames:v','1','-q:v','3',contactSheetPath],{env});
 return {kind:'persona-visual-evidence-v1',directory:root,frames,contactSheetPath,
  caveat:'Representative decoded frames for local author review; not a visual or artistic approval.'};
}
function latestNumber(log,pattern){
 const values=[...log.matchAll(pattern)].map(match=>Number(match[1])).filter(Number.isFinite);
 return values.length?values.at(-1):null;
}
function distribution(values){
 const sorted=[...values].sort((a,b)=>a-b),at=p=>sorted[Math.min(sorted.length-1,Math.round((sorted.length-1)*p))];
 const mean=values.reduce((sum,value)=>sum+value,0)/values.length;
 return {mean,median:at(.5),p10:at(.1),p90:at(.9),contrastP90P10:at(.9)-at(.1),
  shadowSamplePercent:values.filter(value=>value<32).length/values.length*100,
  midtoneSamplePercent:values.filter(value=>value>=32&&value<=223).length/values.length*100,
  highlightSamplePercent:values.filter(value=>value>223).length/values.length*100};
}

export async function analyzePersonaVideoQuality({videoPath,subtitlePath,expectedDurationSec,outputPath,ffmpegDir}={}){
 if(typeof videoPath!=='string'||!videoPath.trim())fail('videoPath is required');
 const env=mediaEnv(ffmpegDir);
 const path=resolve(videoPath),info=JSON.parse((await run('ffprobe',['-v','error','-show_entries',
  'format=duration,bit_rate:stream=codec_type,codec_name,width,height,avg_frame_rate,bit_rate','-of','json',path],{env})).stdout);
 const details=await stat(path);if(!details.isFile()||details.size<1024)fail('MP4 is missing or too small');
 const video=info.streams?.find(stream=>stream.codec_type==='video'),audio=info.streams?.find(stream=>stream.codec_type==='audio');
 if(!video)fail('video stream missing');
 const durationSec=Number(info.format?.duration),fps=rational(video.avg_frame_rate);
 if(!Number.isFinite(durationSec)||durationSec<=0||!Number.isFinite(fps))fail('FFprobe did not return duration or FPS');
 const findings=[];
 const blackLog=await scan(path,['-vf','blackdetect=d=0.2:pix_th=0.10','-an'],env);
 const blacks=parseIntervals(blackLog,'black');
 findings.push(cleanFinding(blacks.length?
  finding('black_frames','warning','Чёрные кадры',`Обнаружено ${blacks.length} интервал(а/ов) чёрного изображения.`,blacks.map(x=>timecode(x.startSec)),{intervals:blacks}):
  finding('black_frames','measured','Чёрные кадры','FFmpeg blackdetect не обнаружил интервалов от 0,2 с.',[],{intervals:[]})));
 try{
  const freezeLog=await scan(path,['-vf','freezedetect=n=0.003:d=0.8','-an'],env);
  const freezes=parseIntervals(freezeLog,'freeze');
  findings.push(cleanFinding(freezes.length?
   finding('frozen_frames','warning','Возможные зависания кадра',`Обнаружено ${freezes.length} длинных неподвижных интервалов.`,freezes.map(x=>timecode(x.startSec)),{intervals:freezes}):
   finding('frozen_frames','measured','Зависания кадра','FFmpeg freezedetect не обнаружил интервалов от 0,8 с.',[],{intervals:[]})));
 }catch(error){findings.push(finding('frozen_frames','not_measured','Зависания кадра','freezedetect недоступен в текущем FFmpeg; требуется просмотр человеком.'))}
 try{
  const sampleRate=4;
  const signalLog=await scan(path,['-vf','fps='+sampleRate+',signalstats,metadata=mode=print','-an'],env);
  const luma=[...signalLog.matchAll(/lavfi\.signalstats\.YAVG=([0-9.]+)/g)].map(m=>Number(m[1])).filter(Number.isFinite);
  const u=[...signalLog.matchAll(/lavfi\.signalstats\.UAVG=([0-9.]+)/g)].map(m=>Number(m[1])).filter(Number.isFinite);
  const v=[...signalLog.matchAll(/lavfi\.signalstats\.VAVG=([0-9.]+)/g)].map(m=>Number(m[1])).filter(Number.isFinite);
  if(luma.length>=2){
   const lumaDistribution=distribution(luma);
   if(u.length>=2&&v.length>=2){
    const color={uMean:u.reduce((sum,value)=>sum+value,0)/u.length,vMean:v.reduce((sum,value)=>sum+value,0)/v.length,
     uMedian:distribution(u).median,vMedian:distribution(v).median};
    findings.push(finding('visual_metrics','measured','Яркость, контраст и цветовая сводка',
     'Измерено по '+luma.length+' равномерным кадрам (4 кадра/с). Проценты относятся к выборке средних яркостей кадров, а не к пикселям; пересвет и цвет кожи требуют просмотра.',[],
     {sampleRate,sampleCount:luma.length,luma:lumaDistribution,color,pixelExposure:'not_measured'}));
   }else findings.push(finding('visual_metrics','not_measured','Яркость, контраст и цветовая сводка','FFmpeg не вернул достаточных UAVG/VAVG-проб для воспроизводимой цветовой сводки.'));
   const jumps=luma.slice(1).map((value,index)=>({atSec:(index+1)/sampleRate,delta:Math.abs(value-luma[index])})).filter(x=>x.delta>=55);
   findings.push(cleanFinding(jumps.length?
    finding('luma_jumps','warning','Резкие перепады яркости',`На 4-кадровых пробах в секунду есть ${jumps.length} сильных скачков средней яркости.`,jumps.map(x=>timecode(x.atSec)),{sampleRate,sampleCount:luma.length,jumps}):
    finding('luma_jumps','measured','Перепады яркости','На 4-кадровых пробах в секунду сильных скачков средней яркости не найдено.',[],{sampleRate,sampleCount:luma.length,maxDelta:Math.max(...luma.slice(1).map((v,i)=>Math.abs(v-luma[i])))})));
   if(u.length>=2&&v.length>=2){
    const chroma=u.slice(1).map((value,index)=>({atSec:(index+1)/sampleRate,delta:Math.hypot(value-u[index],v[index+1]-v[index])}));
    const jumps=chroma.filter(sample=>sample.delta>=45);
    findings.push(finding('chroma_jumps',jumps.length?'warning':'measured','Подозрительные цветовые скачки',jumps.length?`На 4-кадровых пробах в секунду есть ${jumps.length} сильных скачков цветности.`:'На 4-кадровых пробах в секунду сильных скачков цветности не найдено.',jumps.map(sample=>timecode(sample.atSec)),{sampleRate,sampleCount:chroma.length+1,jumps,maxDelta:Math.max(...chroma.map(sample=>sample.delta))}));
   }else findings.push(finding('chroma_jumps','not_measured','Подозрительные цветовые скачки','FFmpeg не вернул достаточных UAVG/VAVG-проб для воспроизводимой оценки.'));
  }else findings.push(finding('luma_jumps','not_measured','Перепады яркости','FFmpeg не вернул достаточных YAVG-проб для воспроизводимой оценки.'));
 }catch(error){findings.push(finding('luma_jumps','not_measured','Перепады яркости','signalstats недоступен; нужна визуальная проверка.'))}
 findings.push(finding('exposure_and_color','needs_human_review','Экспозиция, тени и цвет','Технические метрики не доказывают естественный цвет кожи или художественную цветокоррекцию. Проверьте переходы, пересветы и тени на экране.',[]));
 if(audio){
  const silenceLog=await scan(path,['-af','silencedetect=noise=-50dB:d=1.5','-vn'],env);
  const silences=parseIntervals(silenceLog,'silence');
  findings.push(cleanFinding(silences.length?
   finding('audio_silence','warning','Длительная тишина',`Обнаружено ${silences.length} фрагмент(а/ов) тишины от 1,5 с.`,silences.map(x=>timecode(x.startSec)),{intervals:silences}):
   finding('audio_silence','measured','Длительная тишина','FFmpeg silencedetect не обнаружил тишины от 1,5 с.',[],{intervals:[]})));
  try{
   const loudnessLog=await scan(path,['-af','ebur128=peak=true','-vn'],env);
   const integratedLufs=latestNumber(loudnessLog,/\bI:\s*(-?[0-9.]+) LUFS/g);
   const truePeakDbTP=latestNumber(loudnessLog,/(?:True peak|Peak):\s*(-?[0-9.]+) dBFS/g);
   if(integratedLufs===null||truePeakDbTP===null)throw Error('missing EBU R128 summary');
   const clipping=truePeakDbTP>=-0.1;
   findings.push(cleanFinding(finding('audio_loudness',clipping?'warning':'measured','Громкость и true peak',
    clipping?'True peak близок к 0 dBFS: проверьте возможный клиппинг.':'Измерены integrated LUFS и true peak; восприятие баланса речи и музыки требует прослушивания.',[],{integratedLufs,truePeakDbTP})));
   const momentary=[...loudnessLog.matchAll(/\bt:\s*([0-9.]+).*?\bM:\s*(-?[0-9.]+) LUFS/g)].map(match=>({atSec:Number(match[1]),lufs:Number(match[2])})).filter(sample=>Number.isFinite(sample.atSec)&&Number.isFinite(sample.lufs)&&sample.lufs>-70);
   if(momentary.length>=2){
    const jumps=momentary.slice(1).map((sample,index)=>({...sample,deltaDb:Math.abs(sample.lufs-momentary[index].lufs)})).filter(sample=>sample.deltaDb>=12);
    findings.push(finding('audio_loudness_jumps',jumps.length?'warning':'measured','Резкие изменения громкости',jumps.length?'В 100-мс EBU R128-пробах есть скачки от 12 dB. Проверьте склейки и музыку.':'В доступных 100-мс EBU R128-пробах скачков от 12 dB не найдено.',jumps.map(sample=>timecode(sample.atSec)),{sampleCount:momentary.length,jumps}));
   }else findings.push(finding('audio_loudness_jumps','not_measured','Резкие изменения громкости','В FFmpeg-логе нет достаточных momentary-проб; для оценки переходов нужна проверка на слух.'));
  }catch(error){findings.push(finding('audio_loudness','not_measured','Громкость и true peak','EBU R128 не дал полного измерения в текущем FFmpeg.'))}
 }else findings.push(finding('audio_stream','warning','Звуковая дорожка','В MP4 нет аудиопотока. Нужна пересъёмка или корректный рендер.',[]));
 if(typeof subtitlePath==='string'&&subtitlePath.trim()){
  const subtitle=await readFile(resolve(subtitlePath),'utf8'),parsed=parseSrt(subtitle,durationSec);
  if(!parsed.problems.length)findings.push(finding('subtitles_timing','measured','Субтитры: таймкоды и строки','SRT не содержит пересечений, лишних строк или таймкодов за пределами ролика.',[],{cueCount:parsed.cueCount,problems:[]}));
  else{
   const byId=new Map();for(const problem of parsed.problems){const list=byId.get(problem.id)||[];list.push(problem);byId.set(problem.id,list)}
   for(const [id,problems] of byId)findings.push(finding(id,'warning','Субтитры: '+id,`Найдено ${problems.length} проблем(ы) SRT типа ${id}.`,problems.map(x=>timecode(x.startSec||0)),{cueCount:parsed.cueCount,problems}));
  }
  findings.push(finding('subtitle_safe_area','needs_human_review','Безопасная область субтитров','SRT не содержит экранных координат. Проверьте читаемость в Instagram UI, особенно нижнюю безопасную зону.',[]));
 }else findings.push(finding('subtitles_timing','not_measured','Субтитры: таймкоды и строки','SRT не передан: встроенные в MP4 субтитры нельзя надёжно извлечь без OCR.',[]));
 if(Number.isFinite(expectedDurationSec)){
  const delta=durationSec-Number(expectedDurationSec),status=Math.abs(delta)>.25?'warning':'measured';
  findings.push(finding('expected_duration',status,'Длительность относительно сценария',status==='warning'?`Файл отличается от ожидаемой длительности на ${delta.toFixed(3)} с.`:'Длительность совпадает с ожидаемой в пределах 0,25 с.',[],{expectedDurationSec:Number(expectedDurationSec),actualDurationSec:durationSec,deltaSec:delta}));
 }
 findings.push(finding('acting','needs_human_review','Актёрская игра и реакции','Автоматический анализ не оценивает игру, мимику, естественность пауз или выразительность монтажа. Просмотрите указанные проблемные таймкоды.',[]));
 findings.push(finding('identity_preservation','needs_human_review','Лицо, очки, руки и клавиши','FFprobe/FFmpeg не доказывают сохранность внешности и геометрии. Убедитесь визуально, что финализация не изменила лицо, очки, руки или инструмент.',[]));
 const evidence=await visualEvidence({videoPath:path,durationSec,outputPath,env});
 const report={version:1,kind:'persona-video-quality-v1',status:'awaiting-author-review',publicationApproved:false,distributionAllowed:false,
  analyzedAt:new Date().toISOString(),video:{path,sha256:await hash(path),bytes:details.size,durationSec,width:video.width,height:video.height,fps,codec:video.codec_name,bitrate:Number(video.bit_rate||info.format?.bit_rate)||null,audioCodec:audio?.codec_name??null},
  findings,...(evidence?{visualEvidence:evidence}:{}),authorApproval:{approvedByAuthor:false,publicationApproved:false},
  caveat:'Measured findings are local FFmpeg/FFprobe evidence for this exact SHA-256. They do not approve artistic quality, identity preservation, music suitability, or publication.'};
 if(outputPath){const out=resolve(outputPath);await access(out).then(()=>fail('output already exists'),error=>{if(error.code!=='ENOENT')throw error});await writeFile(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
 return report;
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
 const [videoPath,subtitlePath,expectedDuration,outputPath,ffmpegDir]=process.argv.slice(2);
 analyzePersonaVideoQuality({videoPath,subtitlePath,expectedDurationSec:expectedDuration===undefined?undefined:Number(expectedDuration),outputPath,ffmpegDir}).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error.message);process.exitCode=1});
}
