/** Distribution plan only. No network operations, no inferred publication. */
export const CHANNELS=Object.freeze(['instagram','youtube-shorts','vk-video','tiktok']);
export function buildDistributionPlan({contentId,format,approved=false,masterSha256,channels}){
 if(typeof contentId!=='string'||!contentId.trim())throw new Error('contentId required');
 if(!['reel','photo','carousel','long-video','story'].includes(format))throw new Error('Unsupported format');
 if(typeof masterSha256!=='string'||!/^[a-f0-9]{64}$/i.test(masterSha256))throw new Error('Verified master SHA256 required');
 const supported=format==='reel'?CHANNELS:format==='long-video'?['youtube','vk-video']:format==='story'?['instagram']:['instagram','vk'];
 const requested=channels??supported;
 if(!Array.isArray(requested)||!requested.length||new Set(requested).size!==requested.length||requested.some(c=>!supported.includes(c)))throw new Error('Unsupported or repeated destination');
 return {version:1,contentId,format,masterSha256,approved,deliveries:requested.map(channel=>({
  id:contentId+':'+channel,channel,status:approved?'awaiting_provider_check':'awaiting_approval',
  externalPostId:null,verifiedAt:null,attempts:0,lastError:null,
 }))};
}
export function updateDelivery(plan,{channel,status,externalPostId=null,verifiedAt=null,error=null}){
 const states=['awaiting_approval','awaiting_provider_check','ready','uploading','published','failed','manual_required'];
 if(!states.includes(status))throw new Error('Invalid delivery status');
 const existing=plan.deliveries.find(d=>d.channel===channel);
 if(!existing)throw new Error('Unknown channel');
 if(status!=='awaiting_approval'&&!plan.approved)throw new Error('Publication has not been approved');
 if(status==='published'&&(!externalPostId||!verifiedAt||!Number.isFinite(Date.parse(verifiedAt))))throw new Error('Published requires verified external post ID and timestamp');
 if(existing.status==='published'){
  if(status!=='published'||externalPostId!==existing.externalPostId||verifiedAt!==existing.verifiedAt)throw new Error('Published destination is immutable');
  return plan;
 }
 return {...plan,deliveries:plan.deliveries.map(d=>d.channel!==channel?d:{
  ...d,status,externalPostId:status==='published'?externalPostId:null,
  verifiedAt:status==='published'?verifiedAt:null,lastError:error,
  attempts:d.attempts+(status==='uploading'?1:0),
 })};
}
export function distributionSummary(plan){
 const published=plan.deliveries.filter(d=>d.status==='published').length;
 return {published,total:plan.deliveries.length,complete:published===plan.deliveries.length,
  needsAttention:plan.deliveries.filter(d=>['failed','manual_required'].includes(d.status)).map(d=>d.channel)};
}
