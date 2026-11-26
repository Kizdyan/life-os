/** Publication policy is not a publisher. A notification or a planner flag is not a receipt. */
export type Destination='instagram'|'tiktok'|'youtube-community'|'vk'|'threads';
export type MusicEvidence={kind:'native-confirmed';title:string;artist:string}|{kind:'licensed-embedded';title:string;assetSha256:string};
export type DeliveryEvidence={mode:'automatic'|'manual';status:string;publicUrl?:string;music?:MusicEvidence;visibility?:{state:'PUBLIC'|'NOT_VISIBLE'|'UNKNOWN';url:string;observedAt:string;source:'platform-public-status'|'independent-viewer'}};
const hosts:Record<Destination,string[]>={instagram:['www.instagram.com','instagram.com'],tiktok:['www.tiktok.com','tiktok.com'], 'youtube-community':['www.youtube.com','youtube.com'],vk:['vk.com','www.vk.com'],threads:['threads.net','www.threads.net','threads.com','www.threads.com']};
function validPublicUrl(destination:Destination,value:string|undefined):boolean{
 if(!value)return false;
 try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||!hosts[destination].includes(u.hostname))return false;
  switch(destination){
   case 'instagram':return /^\/(?:p|reel)\/[\w-]+\/?$/.test(u.pathname);
   case 'tiktok':return /^\/@[^/]+\/(?:video|photo)\/\d+\/?$/.test(u.pathname);
   case 'youtube-community':return /^\/post\/[\w-]+\/?$/.test(u.pathname);
   case 'vk':return /^\/wall-?\d+_\d+\/?$/.test(u.pathname);
   case 'threads':return /^\/@[^/]+\/post\/[\w-]+\/?$/.test(u.pathname);
  }
 }catch{return false}
}
export function assessDelivery(destination:Destination,evidence:DeliveryEvidence){
 const published=evidence.status==='PUBLISHED'&&validPublicUrl(destination,evidence.publicUrl);
 const v=evidence.visibility;
 const visibility=published&&v&&v.url===evidence.publicUrl&&Number.isFinite(Date.parse(v.observedAt))&&['platform-public-status','independent-viewer'].includes(v.source)&&['PUBLIC','NOT_VISIBLE'].includes(v.state)?v.state:'UNKNOWN';
 const music=evidence.music;
 const musicConfirmed=Boolean(music&&music.title.trim()&&(music.kind==='native-confirmed'?music.artist.trim():/^[a-f0-9]{64}$/.test(music.assetSha256)));
 return {published,publiclyVisible:visibility==='PUBLIC',visibility,musicConfirmed,status:published?(visibility==='PUBLIC'?'PUBLISHED_CONFIRMED':visibility==='NOT_VISIBLE'?'RECONCILIATION_REQUIRED':'PROVIDER_RECEIPT_ONLY'):evidence.status==='ERROR'?'FAILED':evidence.mode==='manual'?'MANUAL_UNVERIFIED':'AWAITING_RECEIPT',
  retryAllowed:evidence.mode==='automatic'&&evidence.status==='ERROR'&&!evidence.publicUrl,
  musicRequired:destination==='tiktok'||destination==='instagram',musicGatePassed:destination!=='tiktok'&&destination!=='instagram'||musicConfirmed};
}
/** Exported guidance; the recipient must still choose/verify the track in the app. */
export function photoDeliveryManifest(destination:'instagram'|'tiktok'){
 return {version:1,destination,format:destination==='tiktok'?'image/jpeg':'image/png',width:1080,height:1350,
  music:{required:true,state:'AWAITING_NATIVE_SELECTION',automaticRandomSelection:false},publication:{authorized:false,status:'NOT_SENT',requiresPlatformReceipt:true,requiresPublicVisibilityCheck:true},
  instructions:'Добавить выбранную композицию в приложении соцсети. Не считать уведомление или статус планировщика доказательством публикации. Не повторять успешную площадку.'};
}
