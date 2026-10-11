import {validProcessedAsset} from './persona-processed-asset.mjs';
// Shared runtime-neutral contract. Neither Safari nor this module runs media codecs.
export const JOB_STATES=Object.freeze(['queued','processing','review','ready','failed']);
const ID_RE=/^[a-f0-9]{32}$/i;
const SCOPE_RE=/^[a-zA-Z0-9:._-]{1,180}$/;
const VIDEO_RE=/^video\/[a-z0-9.+-]{1,80}$/i;
const safeString=(value,label)=> {
 if(typeof value!=='string'||!SCOPE_RE.test(value))throw Error('invalid_'+label);
 return value;
};
export function createRequest(data){
 if(!data||typeof data!=='object')throw Error('invalid_processing_request');
 const assetId=String(data.assetId||'');
 if(!ID_RE.test(assetId))throw Error('invalid_asset_id');
 const projectId=safeString(data.projectId,'project_id');
 const contentItemId=safeString(data.contentItemId,'content_item_id');
 const ideaId=safeString(data.ideaId,'idea_id');
 const sessionId=safeString(data.sessionId,'session_id');
 if(!Number.isSafeInteger(data.ideaVersion)||data.ideaVersion<1)throw Error('invalid_idea_version');
 if(!Number.isSafeInteger(data.bytes)||data.bytes<1||data.bytes>5*1024*1024*1024)throw Error('invalid_media_bytes');
 const filename=String(data.filename||'');
 if(!filename||filename.length>255||/[\\/\x00-\x1f]/.test(filename))throw Error('invalid_filename');
 const mime=String(data.mime||'');
 if(!VIDEO_RE.test(mime))throw Error('only_video_supported');
 return Object.freeze({id:'job-'+assetId.toLowerCase(),assetId:assetId.toLowerCase(),
   projectId,contentItemId,ideaId,ideaVersion:data.ideaVersion,sessionId,
   mime,filename,bytes:data.bytes,engineVersion:'1.1',
   expectedEngineCommit:'646f0708508c0fc603a43c555b771efe1176ee14'});
}
export function sameRequest(a,b){return JSON.stringify(a)===JSON.stringify(b);}
export function newJob(request,at=new Date().toISOString()){
 if(!request||request.id!=='job-'+request.assetId)throw Error('invalid_processing_request');
 return {id:request.id,request,status:'queued',attempt:0,inputReady:false,
  createdAt:at,updatedAt:at,startedAt:null,completedAt:null,
  instagramFile:null,processedAsset:null,outputToken:null,error:null};
}
export function canClaim(job){return job?.status==='queued' && job.inputReady===true;}
export function markInputReady(job,receivedBytes,at=new Date().toISOString()){
 if(job.status!=='queued'||receivedBytes!==job.request.bytes)throw Error('incomplete_or_locked_input');
 if(job.inputReady)return job;
 return {...job,inputReady:true,updatedAt:at};
}
export function transition(job,next,extra={},at=new Date().toISOString()){
 const allowed={queued:['processing','failed'],processing:['review','failed'],review:['ready','failed'],ready:[],failed:[]};
 if(!allowed[job?.status]?.includes(next))throw Error('invalid_processing_transition');
 if(next==='processing'&&!job.inputReady)throw Error('input_not_ready');
 const updated={...job,status:next,updatedAt:at};
 if(next==='processing'){updated.startedAt=at;updated.error=null;}
 if(next==='review'){
  const file=String(extra.instagramFile||'');
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,150}\.mp4$/i.test(file)||file.includes('..'))
    throw Error('invalid_instagram_output');
  updated.instagramFile=file;updated.completedAt=at;
  if(!validProcessedAsset(job,extra.processedAsset))throw Error('invalid_processed_asset_lineage');
  updated.processedAsset=extra.processedAsset;
 }
 if(next==='ready'&&(!job.instagramFile||!validProcessedAsset(job,job.processedAsset)))throw Error('validated_result_required');
 if(next==='failed'){updated.error=String(extra.error||'processing_failed').slice(0,300);updated.completedAt=at;}
 return updated;
}
export function retry(job,at=new Date().toISOString()){
 if(job?.status!=='failed'||!job.inputReady)throw Error('retry_unavailable');
 return {...job,status:'queued',attempt:job.attempt+1,startedAt:null,completedAt:null,
  instagramFile:null,processedAsset:null,outputToken:null,error:null,updatedAt:at};
}
export function recoverMissingSource(job,at=new Date().toISOString()){
 if(!job?.request||!['queued','failed'].includes(job.status))throw Error('source_recovery_unavailable');
 return {...job,status:'queued',inputReady:false,error:'local_source_missing_upload_again',
   instagramFile:null,processedAsset:null,outputToken:null,updatedAt:at};
}
export function publicJob(job){
 const {outputToken,...safe}=job;
 return {...safe,outputAvailable:!!job.instagramFile&&validProcessedAsset(job,job.processedAsset) && ['review','ready'].includes(job.status)};
}
