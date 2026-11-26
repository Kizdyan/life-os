/** Conservative local mix planning. Signal-triggered ducking is not speech recognition.
 * Input is an explicitly supplied soundtrack; no track search or rights inference. */
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const rounded=n=>Number(n.toFixed(4));
const formats=new Set(['auto','explainer','personal','dialogue','voiceover','cinematic','backstage']);
export function buildSoundDesign({format,sourceAudio,enabled,fastDraft}){
 if(!enabled||fastDraft||!formats.has(format))return {status:'MANUAL_MIX_RETAINED',reason:'Disabled, fast draft or protected performance format',publicationApproved:false};
 const silent=Array.isArray(sourceAudio)&&sourceAudio.length>0&&sourceAudio.every(x=>x===false);
 return {version:1,status:'ADAPTIVE_MIX_REQUESTED',mode:silent?'silent-source':'protect-original',originalVolume:1,publicationApproved:false,
  limitations:'Signal-driven balance, not verified speech separation or artistic music selection'};
}
export function measuredSoundtrackGain(measurement,mode){
 if(!['silent-source','protect-original'].includes(mode))throw Error('Invalid adaptive mix mode');
 const targetLufs=mode==='silent-source'?-23:-32;
 const valid=Number.isFinite(measurement?.integratedLufs)&&Number.isFinite(measurement?.truePeakDb)&&measurement.integratedLufs>=-55&&measurement.integratedLufs<=0&&measurement.truePeakDb>=-100&&measurement.truePeakDb<=12;
 if(!valid)return {status:'MEASUREMENT_UNAVAILABLE',targetLufs,volume:mode==='silent-source'?.35:.12,gainDb:null};
 // Never boost a background track; attenuation only, capped by headroom.
 const gainDb=rounded(clamp(Math.min(0,targetLufs-measurement.integratedLufs,-3-measurement.truePeakDb),-60,0));
 return {status:'MEASURED_ATTENUATION',targetLufs,volume:rounded(10**(gainDb/20)),gainDb};
}
export function adaptiveMixFilter({mode,volume,startSec=0,totalSec}){
 if(!['silent-source','protect-original'].includes(mode)||!Number.isFinite(volume)||volume<0||volume>1||!Number.isFinite(startSec)||startSec<0||!Number.isFinite(totalSec)||totalSec<=0||totalSec>900)throw Error('Invalid adaptive audio parameters');
 const fade=rounded(Math.min(.35,totalSec/4)),out=rounded(totalSec-fade);
 const music='[1:a]atrim=start='+startSec+',asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,volume='+volume+',atrim=duration='+totalSec+',asetpts=PTS-STARTPTS,afade=t=in:st=0:d='+fade+',afade=t=out:st='+out+':d='+fade+'[music]';
 const original='[0:a]aresample=48000,aformat=channel_layouts=stereo,asetpts=PTS-STARTPTS';
 const limiter='amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.84:level=0:latency=1[a]';
 return mode==='protect-original'?
  original+',asplit=2[original][key];'+music+';[music][key]sidechaincompress=threshold=0.025:ratio=4:attack=35:release=350[ducked];[original][ducked]'+limiter:
  original+'[original];'+music+';[original][music]'+limiter;
}
export function assessRenderedMix(measurement){
 if(!Number.isFinite(measurement?.integratedLufs)||!Number.isFinite(measurement?.truePeakDb))return {status:'NOT_MEASURED',authorReviewRequired:true};
 const warning=measurement.truePeakDb>-1||measurement.integratedLufs<-35||measurement.integratedLufs>-12;
 return {status:warning?'REVIEW_WARNING':'MEASURED',integratedLufs:measurement.integratedLufs,truePeakDb:measurement.truePeakDb,authorReviewRequired:true,limitations:'Loudness and peak only; listen for speech masking, musical phrasing and transitions.'};
}
