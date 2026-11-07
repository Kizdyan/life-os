/** Fail-closed verification of rendered Persona assets before editorial approval. */
const SHA=/^[a-f0-9]{64}$/i;
const FORMATS=new Set(['reel','short','story','photo','carousel','long-video']);
const VIDEO=new Set(['reel','short','story','long-video']);
const VIDEO_CODECS=new Set(['h264','hevc','av1']);
const AUDIO_CODECS=new Set(['aac','opus']);
export function evaluatePersonaMediaHandoff({contentId,format,assets,authorApproved=false}={}){
 const errors=[];
 if(typeof contentId!=='string'||!contentId.trim())errors.push('contentId missing');
 if(!FORMATS.has(format))errors.push('unsupported format');
 if(!Array.isArray(assets)||assets.length===0)errors.push('no rendered assets');
 const validated=[];
 for(const [index,asset] of (Array.isArray(assets)?assets:[]).entries()){
  const failures=[];
  if(!asset||typeof asset!=='object'){errors.push('asset '+index+' missing');continue;}
  if(typeof asset.path!=='string'||!asset.path.trim())failures.push('missing path');
  if(typeof asset.sha256!=='string'||!SHA.test(asset.sha256))failures.push('missing SHA256');
  if(asset.fileExists!==true)failures.push('file not verified on disk');
  if(asset.probeVerified!==true)failures.push('ffprobe not verified');
  if(!Number.isSafeInteger(asset.bytes)||asset.bytes<=0)failures.push('empty file');
  if(VIDEO.has(format)){
   if(!Number.isFinite(asset.durationSec)||asset.durationSec<=0)failures.push('invalid duration');
   if(!Number.isFinite(asset.fps)||asset.fps<15||asset.fps>120)failures.push('invalid fps');
   if(!Number.isSafeInteger(asset.width)||!Number.isSafeInteger(asset.height)||asset.width<=0||asset.height<=0)failures.push('invalid dimensions');
   if(!VIDEO_CODECS.has(asset.videoCodec))failures.push('unsupported video codec');
   if(!AUDIO_CODECS.has(asset.audioCodec))failures.push('missing or unsupported audio codec');
   if(asset.blackFrameCheckPassed!==true)failures.push('black frame check not passed');
   if(asset.audioCheckPassed!==true)failures.push('audio check not passed');
  }else{
   if(!Number.isSafeInteger(asset.width)||!Number.isSafeInteger(asset.height)||asset.width<=0||asset.height<=0)failures.push('invalid dimensions');
   if(!['png','jpeg','webp'].includes(asset.imageFormat))failures.push('unsupported image format');
  }
  validated.push({path:asset.path,sha256:asset.sha256||null,passed:failures.length===0,errors:failures});
  errors.push(...failures.map(f=>'asset '+index+': '+f));
 }
 if(!authorApproved)errors.push('author approval required');
 return {version:1,contentId:contentId||null,format:format||null,passed:errors.length===0,
  status:errors.length?'blocked':'approved_for_distribution',errors,assets:validated};
}
export function buildVerifiedPersonaDeliveryInput({handoff,assetIndex=0,channels}={}){
 if(!handoff||handoff.passed!==true||handoff.status!=='approved_for_distribution')throw new Error('Approved media handoff required');
 const asset=handoff.assets?.[assetIndex];
 if(!asset?.passed||!SHA.test(asset.sha256||''))throw new Error('Verified media asset required');
 return {contentId:handoff.contentId,format:handoff.format==='short'?'reel':handoff.format,approved:true,masterSha256:asset.sha256,channels};
}
