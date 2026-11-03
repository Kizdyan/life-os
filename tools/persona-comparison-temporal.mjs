/**
 * Limited-band temporal QC. Compares source and graded luma at aligned timestamps.
 * Potential flicker is a review candidate, never a technical FAIL or artistic verdict.
 */
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';

function mediaEnv(ffmpegDir){
 const env={...process.env},key=Object.keys(env).find(name=>name.toLowerCase()==='path')||'PATH';
 if(ffmpegDir)env[key]=resolve(ffmpegDir)+(process.platform==='win32'?';':':')+(env[key]||'');
 return env;
}
export async function sampleTemporalLuma(videoPath,{ffmpegDir,sampleRate=12,durationSec=60}={}){
 if(![6,12,24].includes(sampleRate))throw Error('Unsupported temporal sample rate');
 const timeoutMs=Math.max(120000,Math.ceil(durationSec*6000));
 const args=['-hide_banner','-nostdin','-loglevel','info','-i',resolve(videoPath),
  '-vf','fps='+sampleRate+',scale=64:-2:flags=fast_bilinear,signalstats,metadata=mode=print:key=lavfi.signalstats.YAVG',
  '-an','-f','null','-'];
 return await new Promise((ok,bad)=>{
  const child=spawn('ffmpeg',args,{env:mediaEnv(ffmpegDir),shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
  const samples=[],buffers={stdout:'',stderr:''},times={stdout:null,stderr:null};
  let finished=false,errorMessage='',truncated=false;
  const finish=error=>{if(finished)return;finished=true;clearTimeout(timer);error?bad(error):ok(samples.sort((a,b)=>a.atSec-b.atSec))};
  const timer=setTimeout(()=>{child.kill();finish(Error('temporal FFmpeg timed out'))},timeoutMs);
  function line(name,text){
   if(text.includes('Error')||text.includes('Invalid'))errorMessage=text.slice(-600);
   const frame=/frame:\s*\d+\s+pts:\s*-?\d+\s+pts_time:\s*(-?[0-9.]+)/.exec(text);
   if(frame){const value=Number(frame[1]);times[name]=Number.isFinite(value)?value:null}
   const y=/lavfi\.signalstats\.YAVG=([0-9.]+)/.exec(text);
   if(y&&times[name]!==null){
    const value=Number(y[1]);
    if(Number.isFinite(value)&&value>=0&&value<=255&&samples.length<30000)
     samples.push({atSec:times[name],y:value});
    else truncated=true;
   }
  }
  for(const name of ['stdout','stderr']){
   child[name].on('data',chunk=>{
    buffers[name]+=chunk.toString();
    let pos;
    while((pos=buffers[name].indexOf('\n'))!==-1){
     const text=buffers[name].slice(0,pos).trim();
     buffers[name]=buffers[name].slice(pos+1);
     line(name,text);
    }
    if(buffers[name].length>30000){truncated=true;buffers[name]=''}
   });
  }
  child.on('error',finish);
  child.on('close',code=>{
   if(finished)return;
   for(const name of ['stdout','stderr'])if(buffers[name])line(name,buffers[name]);
   if(code!==0)return finish(Error('temporal FFmpeg failed: '+errorMessage+' (exit '+code+')'));
   if(truncated)return finish(Error('temporal FFmpeg output exceeded safety limits'));
   if(samples.length<3)return finish(Error('not enough temporal luma samples'));
   finish();
  });
 });
}
const round=value=>Number(value.toFixed(3));
/**
 * Screens for alternating isolated luma changes introduced by the grade.
 * Moving cameras, scene cuts and natural content are not reliably disambiguated;
 * thresholds intentionally produce *candidates*, never automated failure.
 */
export function compareTemporalLuma(reference,candidate,{sampleRate=12}={}){
 if(!Array.isArray(reference)||!Array.isArray(candidate)||![6,12,24].includes(sampleRate))
  throw Error('invalid temporal samples');
 let j=0;
 const aligned=[];
 for(const sample of reference){
  if(!Number.isFinite(sample?.atSec)||!Number.isFinite(sample?.y))continue;
  while(j+1<candidate.length&&Math.abs(candidate[j+1].atSec-sample.atSec)<Math.abs(candidate[j].atSec-sample.atSec))j++;
  const next=candidate[j];
  if(next&&Number.isFinite(next.atSec)&&Number.isFinite(next.y)&&
   Math.abs(next.atSec-sample.atSec)<=0.5/sampleRate+0.002)
   aligned.push({atSec:sample.atSec,source:sample.y,graded:next.y,delta:next.y-sample.y});
 }
 const coverage=reference.length?aligned.length/reference.length:0;
 if(aligned.length<5||coverage<0.8)
  return {status:'not_measured',sampleRate,alignedSamples:aligned.length,coverage:round(coverage),
   candidates:[],reason:'Insufficient timestamp-aligned samples; no temporal conclusion.'};
 const candidates=[];
 for(let i=1;i<aligned.length-1;i++){
  const left=aligned[i-1],mid=aligned[i],right=aligned[i+1];
  if(mid.atSec-left.atSec>1.6/sampleRate||right.atSec-mid.atSec>1.6/sampleRate)continue;
  const sourceBefore=Math.abs(mid.source-left.source);
  const sourceAfter=Math.abs(right.source-mid.source);
  if(sourceBefore>8||sourceAfter>8)continue; // scene/motion change, not reliable grading evidence
  const swing=Math.abs(mid.delta-(left.delta+right.delta)/2);
  const alternating=(mid.delta-left.delta)*(right.delta-mid.delta)<0;
  if(alternating&&swing>=10)
   candidates.push({atSec:round(mid.atSec),amplitude:round(swing),kind:'potential_temporal_flicker'});
 }
 const grouped=[];
 for(const event of candidates){
  const prev=grouped.at(-1);
  if(prev&&event.atSec-prev.lastSec<=0.25){
   prev.lastSec=event.atSec;prev.events+=1;prev.amplitude=Math.max(prev.amplitude,event.amplitude);
  }else grouped.push({atSec:event.atSec,lastSec:event.atSec,amplitude:event.amplitude,events:1,kind:event.kind});
 }
 return {status:'measured',sampleRate,alignedSamples:aligned.length,coverage:round(coverage),
  candidates:grouped.sort((a,b)=>b.amplitude-a.amplitude).slice(0,20),
  limitation:'Review candidates only; samples do not prove a grading error and can miss flicker above the sampling Nyquist limit.'};
}


/** Suppress candidate jumps at strong changes already present in the original. */
export function hasSourceTransitionNear(samples,atSec,{windowSec=0.18,minLumaDelta=12}={}){
 if(!Array.isArray(samples)||!Number.isFinite(atSec))return false;
 for(let i=1;i<samples.length;i++){
  const previous=samples[i-1],current=samples[i];
  if(!Number.isFinite(previous?.atSec)||!Number.isFinite(current?.atSec)||
   !Number.isFinite(previous?.y)||!Number.isFinite(current?.y))continue;
  if(Math.abs(current.atSec-atSec)<=windowSec&&Math.abs(current.y-previous.y)>=minLumaDelta)return true;
 }
 return false;
}
