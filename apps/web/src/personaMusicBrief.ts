/** A proposed soundtrack is not a verified platform attachment.
 * Keep exact content revision and destination, preserve author choice. */
export type MusicDestination='instagram'|'tiktok';
export type MusicCandidate={title:string;artist:string;reason:string;fragmentHint:string;availability:'UNKNOWN'|'AVAILABLE'|'UNAVAILABLE';rights:'UNKNOWN'|'PLATFORM_LICENSE_CONFIRMED'|'LICENSED_ASSET';checkedAt?:string;platformTrackId?:string};
export type MusicBrief={version:1;contentId:string;revision:number;destination:MusicDestination;dramaturgy:string;candidates:MusicCandidate[];selectedIndex:number|null};
const bounded=(x:unknown,n:number):x is string=>typeof x==='string'&&x.trim().length>0&&x.length<=n;
export function validateMusicBrief(raw:unknown):MusicBrief{
 const x=raw as MusicBrief;
 if(!x||x.version!==1||!bounded(x.contentId,160)||!Number.isSafeInteger(x.revision)||x.revision<1||
 !['instagram','tiktok'].includes(x.destination)||!bounded(x.dramaturgy,800)||!Array.isArray(x.candidates)||x.candidates.length!==3||
 (x.selectedIndex!==null&&(!Number.isInteger(x.selectedIndex)||x.selectedIndex<0||x.selectedIndex>=3)))throw Error('Нужны три варианта музыки для конкретного материала и площадки');
 const keys=new Set<string>();
 for(const c of x.candidates){
  if(!c||!bounded(c.title,180)||!bounded(c.artist,180)||!bounded(c.reason,500)||!bounded(c.fragmentHint,240)||
   !['UNKNOWN','AVAILABLE','UNAVAILABLE'].includes(c.availability)||!['UNKNOWN','PLATFORM_LICENSE_CONFIRMED','LICENSED_ASSET'].includes(c.rights)||
   (c.checkedAt!==undefined&&(!bounded(c.checkedAt,50)||!Number.isFinite(Date.parse(c.checkedAt))))||
   (c.platformTrackId!==undefined&&!bounded(c.platformTrackId,160)))throw Error('Некорректный кандидат музыкального сопровождения');
  if((c.availability!=='UNKNOWN'||c.rights!=='UNKNOWN')&&!c.checkedAt)throw Error('Нужна дата проверки доступности/прав');
  const key=(c.artist+'|'+c.title).normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
  if(keys.has(key))throw Error('Повтор музыкального кандидата');keys.add(key);
 }
 return x;
}
export function musicBriefState(raw:unknown,scope:{contentId:string;revision:number;destination:MusicDestination}){
 if(raw===null||raw===undefined)return 'AWAITING_PROPOSALS' as const;
 const brief=validateMusicBrief(raw);
 if(brief.contentId!==scope.contentId||brief.revision!==scope.revision||brief.destination!==scope.destination)return 'STALE_BRIEF' as const;
 if(brief.selectedIndex===null)return 'AWAITING_SELECTION' as const;
 const c=brief.candidates[brief.selectedIndex];
 if(c.availability==='UNAVAILABLE')return 'BLOCKED_UNAVAILABLE' as const;
 if(c.availability!=='AVAILABLE'||c.rights==='UNKNOWN')return 'AWAITING_AVAILABILITY_OR_RIGHTS' as const;
 return 'SELECTED_NOT_ATTACHED' as const;
}
export function musicBriefRequest(scope:{contentId:string;revision:number;destination:MusicDestination},topic:string,caption:string){
 return {version:1,...scope,topic,caption,requiredCandidates:3,state:'AWAITING_PROPOSALS',selectedIndex:null,
  instructions:'Подбери три разные композиции: драматургическая функция, характер, темп, подходящий фрагмент, причина выбора. Не утверждай доступность или лицензию без проверки в конкретной соцсети. Выбранная музыка не означает прикреплённую музыку.',automaticSelection:false,attached:false};
}
