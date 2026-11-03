#!/usr/bin/env node
/**
 * Comparison QC for an existing Persona five-file package.
 * Read-only for the original and graded MP4s. Artistic acceptance is NEVER automatic.
 */
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {access,mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import {basename,dirname,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {analyzePersonaVideoQuality} from './persona-video-quality.mjs';
import {compareTemporalLuma,sampleTemporalLuma} from './persona-comparison-temporal.mjs';

const variants=[
 {id:'natural-clean',fileName:'A-natural-clean.mp4'},
 {id:'warm-cinematic',fileName:'B-warm-cinematic.mp4'},
 {id:'muted-filmic',fileName:'C-muted-filmic.mp4'},
];
const fail=message=>{throw Error('Persona comparison QC: '+message)};
const sha256=async path=>{
 const hash=createHash('sha256');
 for await(const chunk of createReadStream(path))hash.update(chunk);
 return hash.digest('hex');
};
const shortName=value=>{
 if(typeof value!=='string'||!value)return null;
 const name=value.split(/[\\/]/).pop();
 return name&&name!=='.'&&name!=='..'&&name.length<=220&&name.toLowerCase().endsWith('.mp4')?name:null;
};
const verifyAbsent=async path=>{
 try{await access(path);fail('output already exists: '+path)}
 catch(error){if(error.code!=='ENOENT')throw error}
};
const clock=seconds=>{
 const s=Math.max(0,seconds);
 return String(Math.floor(s/60)).padStart(2,'0')+':'+String(Math.floor(s%60)).padStart(2,'0')+'.'+String(Math.round((s%1)*1000)).padStart(3,'0');
};
function ffmpegEnv(ffmpegDir){
 const env={...process.env},key=Object.keys(env).find(x=>x.toLowerCase()==='path')||'PATH';
 if(ffmpegDir)env[key]=resolve(ffmpegDir)+(process.platform==='win32'?';':':')+(env[key]||'');
 return env;
}
function run(args,env){
 return new Promise((ok,bad)=>{
  const child=spawn('ffmpeg',args,{shell:false,windowsHide:true,env,stdio:['ignore','ignore','pipe']});
  let stderr='',done=false;
  const timer=setTimeout(()=>{if(!done){done=true;child.kill();bad(Error('FFmpeg frame extraction timed out'))}},120000);
  child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-3000)});
  child.on('error',error=>{if(!done){done=true;clearTimeout(timer);bad(error)}});
  child.on('close',code=>{if(done)return;done=true;clearTimeout(timer);code===0?ok():bad(Error('FFmpeg exited '+code+': '+stderr))});
 });
}
function finding(report,id){return report.findings.find(item=>item.id===id)}
function jumps(report,id){
 return (finding(report,id)?.measurement?.jumps??[]).filter(x=>Number.isFinite(x.atSec));
}
function newJumps(reference,candidate,id){
 const source=jumps(reference,id);
 return jumps(candidate,id).filter(item=>!source.some(other=>Math.abs(item.atSec-other.atSec)<=0.26))
  .map(item=>({atSec:item.atSec,delta:item.delta??null,kind:id}));
}
const rounded=value=>Number(value.toFixed(3));
function moments(durationSec,hotspots){
 const times=[0.25,durationSec*.2,durationSec*.5,durationSec*.8,durationSec-.25,...hotspots.slice(0,5).map(x=>x.atSec)];
 return [...new Set(times.map(t=>rounded(Math.max(0,Math.min(durationSec-.05,t)))))]
  .filter(t=>t>=0&&t<durationSec).sort((a,b)=>a-b);
}
async function pairFrame(source,graded,time,path,environment){
 await run(['-hide_banner','-nostdin','-loglevel','error','-ss',String(time),'-i',source,
  '-ss',String(time),'-i',graded,'-filter_complex',
  '[0:v]scale=360:640:force_original_aspect_ratio=decrease,pad=360:640:(ow-iw)/2:(oh-ih)/2,setsar=1[left];[1:v]scale=360:640:force_original_aspect_ratio=decrease,pad=360:640:(ow-iw)/2:(oh-ih)/2,setsar=1[right];[left][right]hstack=inputs=2[out]',
  '-map','[out]','-frames:v','1','-q:v','3','-y',path],environment);
}
export async function inspectPersonaComparisonPackage({comparisonDir,outputPath,ffmpegDir}={}){
 if(typeof comparisonDir!=='string'||!comparisonDir.trim()||typeof outputPath!=='string'||!outputPath.trim())
  fail('comparisonDir and a NEW outputPath are required');
 const root=resolve(comparisonDir),output=resolve(outputPath),evidenceDir=join(dirname(output),basename(output).replace(/\.json$/i,'')+'-frames');
 if(output===join(root,'COMPARISON.json'))fail('refusing to overwrite COMPARISON.json');
 await verifyAbsent(output);
 await verifyAbsent(evidenceDir);
 const manifestPath=join(root,'COMPARISON.json');
 const manifestStat=await stat(manifestPath);
 if(!manifestStat.isFile()||manifestStat.size>500000)fail('invalid COMPARISON.json size');
 const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
 if(manifest?.kind!=='persona-color-variants-v1'||manifest.version!==1||manifest.publicationApproved!==false||
  manifest.status!=='awaiting-author-comparison'||!manifest.source||!Array.isArray(manifest.variants)||
  manifest.variants.length!==3)fail('unexpected comparison manifest');
 const sourceName=shortName(manifest.source.path);
 if(!sourceName||!(/^[a-f0-9]{64}$/.test(manifest.source.sha256)))fail('invalid original reference');
 const all=[{id:'original',fileName:sourceName,sha256:manifest.source.sha256}];
 for(const [index,preset] of variants.entries()){
  const item=manifest.variants[index];
  if(item?.id!==preset.id||shortName(item.path)!==preset.fileName||
   !/^[a-f0-9]{64}$/.test(item.sha256??''))fail('unexpected variant '+preset.id);
  all.push({id:preset.id,fileName:preset.fileName,sha256:item.sha256});
 }
 if(new Set(all.map(x=>x.fileName.toLowerCase())).size!==4||new Set(all.map(x=>x.sha256)).size!==4)
  fail('duplicate file names or SHA evidence');
 for(const item of all){
  item.path=join(root,item.fileName);
  const file=await stat(item.path);
  if(!file.isFile()||file.size<1024||file.size>160*1024*1024)fail('unsupported MP4 size: '+item.fileName);
  if(await sha256(item.path)!==item.sha256)fail('SHA-256 mismatch: '+item.fileName);
 }
 // Reuse the existing Video Quality Lab, not a competing set of measurements.
 const reports=[];
 for(const item of all){
  const report=await analyzePersonaVideoQuality({videoPath:item.path,ffmpegDir});
  if(report.video.sha256!==item.sha256)fail('MP4 changed while analyzing: '+item.fileName);
  reports.push(report);
 }
 // Temporal evidence uses aligned source-vs-grade samples. A missing FFmpeg
 // filter must not be interpreted as proof that a grade has no flicker.
 const temporal=[];
 for(const [index,item] of all.entries()){
  try{
   temporal.push({samples:await sampleTemporalLuma(item.path,{ffmpegDir,durationSec:reports[index].video.durationSec})});
  }catch(error){
   temporal.push({error:String(error?.message??error).slice(0,300)});
  }
 }
 const original=reports[0],base=original.video;
 const results=[];
 for(let i=1;i<all.length;i++){
  const item=all[i],report=reports[i],video=report.video;
  const mismatches=[];
  if(video.width!==base.width||video.height!==base.height)mismatches.push('geometry');
  if(Math.abs(video.fps-base.fps)>0.05)mismatches.push('fps');
  if(Math.abs(video.durationSec-base.durationSec)>0.25)mismatches.push('duration');
  if(video.audioCodec!==base.audioCodec)mismatches.push('audio_codec');
  if(video.codec!=='h264')mismatches.push('video_codec');
  if(finding(report,'decode_integrity')?.measurement?.value!=='pass')mismatches.push('decode');
  const sourceMetrics=finding(original,'visual_metrics')?.measurement;
  const gradedMetrics=finding(report,'visual_metrics')?.measurement;
  const stats=sourceMetrics&&gradedMetrics?{
   meanLumaChange:rounded(gradedMetrics.luma.mean-sourceMetrics.luma.mean),
   meanUChange:rounded(gradedMetrics.color.uMean-sourceMetrics.color.uMean),
   meanVChange:rounded(gradedMetrics.color.vMean-sourceMetrics.color.vMean),
   note:'8-bit YUV means of sampled frames; these values do not measure skin tone or artistic quality.'
  }:null;
  const hotspots=[...newJumps(original,report,'luma_jumps'),...newJumps(original,report,'chroma_jumps')]
   .sort((a,b)=>a.atSec-b.atSec);
  const temporalFlicker=temporal[0].samples&&temporal[i].samples
   ?compareTemporalLuma(temporal[0].samples,temporal[i].samples)
   :{status:'not_measured',sampleRate:12,alignedSamples:0,coverage:0,candidates:[],
      reason:'Temporal sampling unavailable: '+(temporal[0].error??temporal[i].error??'unknown')};
  results.push({id:item.id,fileName:item.fileName,sha256:item.sha256,technicalStatus:mismatches.length?'fail':'pass',
   technicalMismatches:mismatches,statistics:stats,additionalSampledJumps:hotspots,temporalFlicker,
   artisticStatus:'awaiting-author-review'});
 }
 const allHotspots=results.flatMap(result=>[
  ...result.additionalSampledJumps,
  ...result.temporalFlicker.candidates.map(candidate=>({
   atSec:candidate.atSec,delta:candidate.amplitude,kind:'temporal_flicker'
  }))
 ]).sort((a,b)=>(b.delta??0)-(a.delta??0));
 const chosen=[];
 for(const candidate of allHotspots)if(!chosen.some(x=>Math.abs(x.atSec-candidate.atSec)<0.5))chosen.push(candidate);
 const frameMoments=moments(base.durationSec,chosen);
 await mkdir(evidenceDir);
 const frames=[];
 for(const [index,time] of frameMoments.entries()){
  const files=[];
  for(const item of all.slice(1)){
   const filename='pair-'+String(index+1).padStart(2,'0')+'-'+item.id+'.jpg';
   await pairFrame(all[0].path,item.path,time,join(evidenceDir,filename),ffmpegEnv(ffmpegDir));
   files.push({variantId:item.id,filename});
  }
  frames.push({atSec:time,timecode:clock(time),pairs:files});
 }
 const sourceDecodeOk=finding(original,'decode_integrity')?.measurement?.value==='pass';
 const report={
  version:1,kind:'persona-comparison-quality-v1',sourceSha256:all[0].sha256,
  createdAt:new Date().toISOString(),publicationApproved:false,
  technicalStatus:!sourceDecodeOk||results.some(x=>x.technicalStatus==='fail')?'fail':'pass',
  artisticStatus:'awaiting-author-review',
  original:{fileName:all[0].fileName,sha256:all[0].sha256,decodeIntegrity:sourceDecodeOk?'pass':'fail',width:base.width,height:base.height,fps:base.fps,durationSec:base.durationSec,
   note:'Native source geometry is preserved; 1080x1920 is not assumed.'},
  variants:results,
  visualEvidence:{directory:evidenceDir,frames,labels:'Each JPEG: ORIGINAL left, variant right.'},
  limitations:[
   '4 fps luma/chroma jump checks are scene/motion-sensitive; 12 fps aligned temporal luma can miss flicker above 6 Hz and cannot rule out grading defects.',
   'New sampled luma/chroma jumps and time-aligned temporal flicker flags are review candidates, not proved grading defects.',
   'Image comparisons are JPEG previews, not a substitute for video playback or skin-tone review.',
   'No objective cinematography or human-identity score is calculated.'
  ],
  authorReview:{state:'pending',selectedVariantId:null,notes:null,publicationApproved:false}
 };
 await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [, ,comparisonDir,outputPath,ffmpegDir]=process.argv;
 inspectPersonaComparisonPackage({comparisonDir,outputPath,ffmpegDir}).then(report=>{
  process.stdout.write('Comparison QC '+report.technicalStatus+'; art remains pending. Report: '+resolve(outputPath)+'\n');
 }).catch(error=>{process.stderr.write(String(error.message||error)+'\n');process.exitCode=1});
}
