// Durable result lineage; no engine or codec implementation.
export const PINNED_VIDEO_ENGINE='646f0708508c0fc603a43c555b771efe1176ee14';
const HASH=/^[a-f0-9]{64}$/;
export function makeProcessedAsset(job,{bytes,sha256,width,height,codec,durationSec}){
 if(!job?.request||!Number.isInteger(job.attempt)||job.attempt<0)throw Error('invalid_result_job');
 if(!Number.isSafeInteger(bytes)||bytes<=1000||!HASH.test(String(sha256||'')))throw Error('invalid_result_integrity');
 if(!Number.isFinite(durationSec)||durationSec<=0.1||durationSec>21600)throw Error('invalid_result_duration');
 if(codec!=='h264'||!Number.isInteger(width)||!Number.isInteger(height)||width<240||width>4320||height>7680||
    height/width<1.7||height/width>1.85)throw Error('invalid_result_video');
 const r=job.request;
 if(r.expectedEngineCommit!==PINNED_VIDEO_ENGINE)throw Error('engine_version_drift');
 return Object.freeze({
  id:'processed-'+r.assetId+'-'+job.attempt,
  processingRequestId:r.id,sourceAssetId:r.assetId,projectId:r.projectId,
  contentItemId:r.contentItemId,ideaId:r.ideaId,ideaVersion:r.ideaVersion,
  sessionId:r.sessionId,attempt:job.attempt,engineCommit:PINNED_VIDEO_ENGINE,
  filename:'instagram.mp4',mime:'video/mp4',bytes,sha256,width,height,codec,durationSec,
  sourceSha256:typeof job.sourceSha256==='string'?job.sourceSha256:null
 });
}
export function validProcessedAsset(job,item){
 const r=job?.request;
 return !!(r&&item&&typeof item==='object'&&
  item.id==='processed-'+r.assetId+'-'+job.attempt &&
  item.processingRequestId===r.id &&item.sourceAssetId===r.assetId &&
  item.projectId===r.projectId &&item.contentItemId===r.contentItemId &&
  item.ideaId===r.ideaId &&item.ideaVersion===r.ideaVersion &&
  item.sessionId===r.sessionId &&item.attempt===job.attempt &&
  item.engineCommit===PINNED_VIDEO_ENGINE &&item.filename==='instagram.mp4' &&
  item.mime==='video/mp4'&&Number.isSafeInteger(item.bytes)&&item.bytes>1000 &&
  item.sourceSha256===(job.sourceSha256||null) &&
  Number.isFinite(item.durationSec)&&item.durationSec>0.1&&item.durationSec<=21600 &&
  HASH.test(String(item.sha256||'')) &&item.codec==='h264' &&
  Number.isInteger(item.width)&&Number.isInteger(item.height)&&
  item.width>=240&&item.width<=4320&&item.height<=7680 &&
  item.height/item.width>=1.7 &&item.height/item.width<=1.85);
}
