// Thin interface for the ORIGINAL V1.1 CLI, which is not present in GitHub.
// Implementations must call the exact existing engine, not add a substitute.
export const V11_PROFILE=Object.freeze({platform:'instagram',format:'reels',container:'mp4',
 videoCodec:'h264',aspectRatio:'9:16'});
export const V11_TIMEOUT_MS=30*60*1000;
export function makeV11Invocation(job,{inputPath,outputDir,signal}){
 if(!job?.request||job.request.id!==job.id||!Number.isInteger(job.attempt)||job.attempt<0)
  throw Error('invalid_v11_invocation');
 if(typeof inputPath!=='string'||!inputPath||typeof outputDir!=='string'||!outputDir)
  throw Error('invalid_v11_paths');
 const r=job.request;
 return Object.freeze({inputPath,outputDir,request:r,processingRequestId:job.id,
  mediaAssetId:r.assetId,projectId:r.projectId,contentItemId:r.contentItemId,
  ideaId:r.ideaId,ideaVersion:r.ideaVersion,sessionId:r.sessionId,attempt:job.attempt,
  outputProfile:V11_PROFILE,signal,timeoutMs:V11_TIMEOUT_MS});
}
export function verifiedAdapterReply(reply){
 if(!reply||typeof reply!=='object'||reply.success!==true||
   typeof reply.instagramPath!=='string'||reply.instagramPath.length===0)
  throw Error('v11_processing_failed');
 return {instagramPath:reply.instagramPath,
  stderrSummary:typeof reply.stderrSummary==='string'?reply.stderrSummary.slice(0,400):''};
}
