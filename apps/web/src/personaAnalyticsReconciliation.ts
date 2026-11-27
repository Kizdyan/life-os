/** Analytics reconciliation: do not attribute deleted provider posts to manually republished content. */
export type Network='instagram'|'tiktok';
export type Identity={contentId:string;network:Network;approvedVersion:string;state:'UNRESOLVED'|'PUBLIC_CONFIRMED';canonicalUrl?:string;supersededUrls:string[];publishedAt?:string};
export type Metrics={views:number|null;reach:number|null;likes:number|null;comments:number|null;shares:number|null;saves:number|null;follows:number|null};
export type Sample={network:Network;url:string;source:'metricool'|'native'|'public';observedAt:string;metrics:Metrics};
export type Snapshot={state:'READY'|'IDENTITY_UNRESOLVED'|'DATA_UNAVAILABLE'|'INVALID_SAMPLE';contentId:string;network:Network;ageHours:number|null;metrics:Metrics|null;source:Sample['source']|null;observedAt:string|null};
const valid=(n:number|null)=>n===null||(Number.isSafeInteger(n)&&n>=0);
function postKey(network:Network,url:string|undefined):string|null{
 if(!url)return null;
 try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)return null;
 const host=u.hostname.replace(/^www\./,'');
 if(network==='tiktok'&&host==='tiktok.com'){const m=u.pathname.match(/^\/@[^/]+\/(?:photo|video)\/(\d+)\/?$/);return m?'tiktok:'+m[1]:null;}
 if(network==='instagram'&&host==='instagram.com'){const m=u.pathname.match(/^\/(?:p|reel)\/([\w-]+)\/?$/);return m?'instagram:'+m[1]:null;}
 }catch{}
 return null;
}
export function reconcileAnalytics(identity:Identity,samples:Sample[]):Snapshot{
 const blank={contentId:identity.contentId,network:identity.network,ageHours:null,metrics:null,source:null,observedAt:null};
 const key=postKey(identity.network,identity.canonicalUrl),published=Date.parse(identity.publishedAt??'');
 if(identity.state!=='PUBLIC_CONFIRMED'||!key||!Number.isFinite(published)||identity.supersededUrls.some(u=>postKey(identity.network,u)===key))
  return {...blank,state:'IDENTITY_UNRESOLVED'};
 const matched=samples.filter(s=>s.network===identity.network&&postKey(s.network,s.url)===key);
 if(!matched.length)return {...blank,state:'DATA_UNAVAILABLE'};
 const usable=matched.filter(s=>Number.isFinite(Date.parse(s.observedAt))&&Date.parse(s.observedAt)>=published&&Object.values(s.metrics).every(valid)&&Object.values(s.metrics).some(v=>v!==null)).sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt));
 if(!usable.length)return {...blank,state:'INVALID_SAMPLE'};
 const s=usable[0];return {...blank,state:'READY',ageHours:(Date.parse(s.observedAt)-published)/3600000,metrics:{...s.metrics},source:s.source,observedAt:s.observedAt};
}
/** Missing observations remain null, not zero. Do not normalize by inflated follower counts. */
export function comparableRates(snapshot:Snapshot){
 const m=snapshot.metrics;
 const ratio=(n:number|null|undefined,d:number|null|undefined)=>n!=null&&d!=null&&d>0?n/d:null;
 return {sharesPerReach:ratio(m?.shares,m?.reach),savesPerReach:ratio(m?.saves,m?.reach),followsPerReach:ratio(m?.follows,m?.reach),sharesPerView:ratio(m?.shares,m?.views)};
}
export function measurementDue(publishedAt:string,now:string,recorded:number[]):number[]{
 const age=(Date.parse(now)-Date.parse(publishedAt))/3600000;
 return Number.isFinite(age)?[24,48,72].filter(h=>age>=h&&!recorded.includes(h)):[];
}
