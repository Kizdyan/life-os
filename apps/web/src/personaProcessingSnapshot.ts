import type {CreativeMediaMetadata} from './personaMediaIntake';
import {jobBelongsToAsset,jobIdForAsset,type ProcessingJob,type ProcessingState} from './personaProcessingClient';

// Device-local, non-authoritative display cache. It NEVER grants output access,
// creates a job or claims that a disconnected desktop is currently "ready".
export type ProcessingSnapshot={id:string;assetId:string;projectId:string;contentItemId:string;
 ideaId:string;ideaVersion:number;sessionId:string;status:ProcessingState;attempt:number;observedAt:string};
const key=(id:string)=>'persona:processing:last-known:'+id;
const STATES=['queued','processing','review','ready','failed'];
export function readProcessingSnapshot(asset:CreativeMediaMetadata|undefined,storage:Pick<Storage,'getItem'>):ProcessingSnapshot|null{
 if(!asset)return null;
 try{
  const raw=storage.getItem(key(jobIdForAsset(asset.id)));
  if(!raw)return null;
  const saved=JSON.parse(raw) as ProcessingSnapshot;
  if(saved.id!==jobIdForAsset(asset.id)||saved.assetId!==asset.id||
    saved.projectId!==asset.projectId||saved.contentItemId!==asset.contentItemId||
    saved.ideaId!==asset.ideaId||saved.ideaVersion!==asset.ideaVersion||
    saved.sessionId!==asset.sessionId||!STATES.includes(saved.status)||
    !Number.isInteger(saved.attempt)||saved.attempt<0||
    !Number.isFinite(Date.parse(saved.observedAt)))return null;
  return saved;
 }catch{return null;}
}
export function saveProcessingSnapshot(job:ProcessingJob,asset:CreativeMediaMetadata,storage:Pick<Storage,'setItem'>):ProcessingSnapshot|null{
 if(!jobBelongsToAsset(job,asset)||!STATES.includes(job.status))return null;
 const snapshot:ProcessingSnapshot={
  id:job.id,assetId:asset.id,projectId:asset.projectId,contentItemId:asset.contentItemId,
  ideaId:asset.ideaId,ideaVersion:asset.ideaVersion,sessionId:asset.sessionId,
  status:job.status,attempt:job.attempt,observedAt:new Date().toISOString()
 };
 try{storage.setItem(key(job.id),JSON.stringify(snapshot));}catch{return null;}
 return snapshot;
}
export function clearProcessingSnapshot(asset:CreativeMediaMetadata|undefined,storage:Pick<Storage,'removeItem'>):void{
 if(!asset)return;
 try{storage.removeItem(key(jobIdForAsset(asset.id)));}catch{}
}
