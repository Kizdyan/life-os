#!/usr/bin/env node
/** Evidence-based source take diagnostics. No face/acting judgements, no editing. */
import { spawn } from 'node:child_process';
import {MAX_PERSONA_SOURCE_SECONDS} from './persona-media-limits.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ffmpeg=process.env.PERSONA_FFMPEG || 'ffmpeg';
function command(args){
  return new Promise((ok,bad)=>{
    const p=spawn(ffmpeg,args,{shell:false,windowsHide:true,stdio:['ignore','ignore','pipe']});
    let err='',finished=false;
    const timer=setTimeout(()=>{if(!finished){finished=true;p.kill();bad(Error('Technical take scan timeout'))}},180000);
    p.stderr.on('data',b=>{err=(err+b).slice(-1000000)});
    p.on('error',e=>{if(!finished){finished=true;clearTimeout(timer);bad(e)}});
    p.on('close',code=>{if(!finished){finished=true;clearTimeout(timer);code===0?ok(err):bad(Error('Technical scan failed: '+err.slice(-1000)))}})
  });
}
function mean(values){return values.length?Number((values.reduce((x,y)=>x+y,0)/values.length).toFixed(2)):null}
function nums(text,key){return [...text.matchAll(new RegExp('lavfi\\.signalstats\\.'+key+'=([\\d.]+)','g'))].map(m=>Number(m[1])).filter(Number.isFinite)}
export function parseTakeDiagnostics(videoLog,audioLog, durationSec,hasAudio){
  const y=nums(videoLog,'YAVG'),sat=nums(videoLog,'SATAVG');
  const black=[...videoLog.matchAll(/black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)/g)]
    .map(m=>({startSec:Number(m[1]),endSec:Number(m[2]),durationSec:Number(m[3])})).filter(x=>x.endSec>x.startSec);
  const max=audioLog.match(/max_volume:\s*(-?(?:\d+(?:\.\d+)?|inf))\s*dB/);
  const silentTrack=max?.[1]==='-inf';
  const peak=max&&!silentTrack?Number(max[1]):null;
  const warnings=[];
  if(!hasAudio)warnings.push('audio_track_missing');
  else if(silentTrack)warnings.push('audio_silent_track_review');
  else if(peak===null||!Number.isFinite(peak))warnings.push('audio_peak_unavailable_review');
  else if(peak>=-0.3)warnings.push('audio_near_digital_ceiling');
  else if(peak< -35)warnings.push('audio_very_low_peak_review');
  if(black.length)warnings.push('black_video_intervals');
  if(y.length && mean(y)<45)warnings.push('low_average_luma_review');
  if(y.length && mean(y)>215)warnings.push('high_average_luma_review');
  return {version:1,kind:'objective-signal-check',durationSec,videoSamples:y.length,meanLuma:mean(y),meanSaturation:mean(sat),blackIntervals:black,audioPeakDb:peak,warnings,
    caveat:'Luminance, black frames and audio peak do not measure acting, story, visual attractiveness, color fidelity or microphone intelligibility.'};
}
export function overlapsBlackInterval(startSec,endSec,blackIntervals,thresholdSec=0.12){
  return (blackIntervals??[]).some(x=>{
    if(!Number.isFinite(x.startSec)||!Number.isFinite(x.endSec))return false;
    return Math.min(endSec,x.endSec)-Math.max(startSec,x.startSec)>thresholdSec;
  });
}
export async function inspectTake({path,durationSec,hasAudio}){
  if(!path||!(durationSec>0)||durationSec>MAX_PERSONA_SOURCE_SECONDS)throw Error('Invalid take inspection input or source exceeds 15 minutes');
  const videoLog=await command(['-hide_banner','-nostdin','-i',path,'-vf','fps=1,scale=320:-2,signalstats,metadata=print','-an','-f','null','-']);
  const blackLog=await command(['-hide_banner','-nostdin','-i',path,'-vf','blackdetect=d=0.2:pix_th=0.10','-an','-f','null','-']);
  const audioLog=hasAudio?await command(['-hide_banner','-nostdin','-i',path,'-vn','-af','volumedetect','-f','null','-']):'';
  return parseTakeDiagnostics(videoLog+'\n'+blackLog,audioLog,durationSec,hasAudio);
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
  const [path,meta,out]=process.argv.slice(2);
  if(!path||!meta||!out){console.error('Usage: node persona-take-qa.mjs <video> <metadata.json> <new-report.json>');process.exitCode=2}
  else readFile(resolve(meta),'utf8').then(JSON.parse).then(m=>inspectTake({path:resolve(path),durationSec:m.durationSec,hasAudio:m.hasAudio})).then(r=>writeFile(resolve(out),JSON.stringify(r,null,2)+'\n',{flag:'wx'})).catch(e=>{console.error(e.message);process.exitCode=1});
}
