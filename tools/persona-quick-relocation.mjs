/**
 * Safe Quick Render source rebinding from a verified offline archive.
 * Original EditPlan/timeline and draft receipt bytes are never rewritten.
 */
import {isAbsolute,join,resolve,basename} from 'node:path';

export const QUICK_RELOCATION_RECORD='persona-relocation.json';
export const QUICK_RELOCATION_KIND='persona-quick-render-relocation-v1';
const HASH=/^[a-f0-9]{64}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const fail=reason=>{throw Error('Persona relocation: '+reason)};
function jobPath(path,id){
 if(typeof path!=='string'||!isAbsolute(path)||basename(resolve(path))!=='quick-'+id)
  fail('Job path must be an absolute Quick Render folder on this operating system');
 return resolve(path);
}
export function validateQuickRelocation(record,{id,currentJobDir,receiptSha256}){
 if(!UUID.test(id)||!HASH.test(receiptSha256??'')||record?.kind!==QUICK_RELOCATION_KIND||
    record.version!==1||record.id!==id||record.receiptSha256!==receiptSha256)
  fail('Relocation provenance does not match the verified draft receipt');
 const current=jobPath(currentJobDir,id),original=jobPath(record.originalJobDir,id);
 if(jobPath(record.restoredJobDir,id)!==current||original===current)
  fail('Relocation target or source differs from saved provenance');
 return original;
}
export function rebindQuickTimeline({jobDir,originalJobDir=jobDir,files,plan,timeline}){
 if(!plan||!Array.isArray(plan.choices)||plan.choices.length<2||
    !timeline||!Array.isArray(timeline.clips)||timeline.clips.length!==plan.choices.length||
    !Array.isArray(files))
  fail('Original EditPlan and timeline do not match');
 const current=resolve(jobDir),sourceRoot=resolve(originalJobDir);
 const videoFiles=files.filter(x=>x.kind==='video');
 const clips=plan.choices.map((choice,i)=>{
  const original=timeline.clips[i],source=videoFiles[choice.fileIndex];
  if(!Number.isInteger(choice.fileIndex)||!source||!/^video-\d{2,3}\.(?:mp4|mov|mkv|webm|m4v)$/.test(source.name??'')||
     !HASH.test(source.sha256??'')||source.sha256!==choice.sourceSha256||
     !original||original.path!==join(sourceRoot,'input',source.name)||
     original.startSec!==choice.startSec||original.durationSec!==choice.durationSec)
   fail('Original EditPlan no longer matches a verified local video source');
  return {...original,path:join(current,'input',source.name)};
 });
 let soundtrack;
 if(timeline.soundtrack!==undefined){
  const audioFiles=files.filter(x=>x.kind==='audio');
  const music=audioFiles.length===1?audioFiles[0]:null;
  if(!music||!/^audio-\d{2,3}\.(?:mp3|wav|m4a|aac|flac)$/.test(music.name??'')||
     !HASH.test(music.sha256??'')||
     timeline.soundtrack?.path!==join(sourceRoot,'input',music.name))
   fail('Original soundtrack is not the verified local upload');
  soundtrack={...timeline.soundtrack,path:join(current,'input',music.name)};
 }
 return {...timeline,clips,...(soundtrack?{soundtrack}:{})};
}
