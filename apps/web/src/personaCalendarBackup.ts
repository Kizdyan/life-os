/** Lossless, fail-closed snapshot of both legacy calendar stores.
 * This does not migrate or activate the daily sprint. */
export const WEEKLY_ANCHOR_KEY='lifeos:persona:unified-weekly-calendar:v1';
export const EDITORIAL_CALENDAR_KEY='lifeos:persona:editorial-calendar:v1';
type SavedSlot={slotId:string;date:string;format:'reel'|'photo'|'carousel';purpose:string;status:string;contentId:string|null;approved:boolean;platforms:string[];notes?:string;weekIndex?:number;legacySavedDate?:boolean};
export type CalendarBackup={weeklyAnchor:string|null;editorialSlots:SavedSlot[]|null};
const validDate=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
export function validateCalendarBackup(raw:unknown):CalendarBackup{
 const x=raw as CalendarBackup;
 if(!x||typeof x!=='object'||Array.isArray(x)||
  (x.weeklyAnchor!==null&&(!validDate(x.weeklyAnchor)||new Date(x.weeklyAnchor+'T00:00:00Z').getUTCDay()!==1))||
  (x.editorialSlots!==null&&(!Array.isArray(x.editorialSlots)||x.editorialSlots.length>1000)))throw Error('Некорректная резервная копия календаря');
 const seen=new Set<string>();
 for(const s of x.editorialSlots??[]){
  if(!s||!validDate(s.date)||!['reel','photo','carousel'].includes(s.format)||s.slotId!=='persona:'+s.date+':'+s.format||seen.has(s.slotId)||
   typeof s.purpose!=='string'||s.purpose.length>300||typeof s.status!=='string'||s.status.length>100||
   (s.contentId!==null&&(typeof s.contentId!=='string'||s.contentId.length>160))||typeof s.approved!=='boolean'||
   !Array.isArray(s.platforms)||s.platforms.length>20||s.platforms.some(p=>typeof p!=='string'||!p||p.length>80)||
   (s.notes!==undefined&&(typeof s.notes!=='string'||s.notes.length>3000))||
   (s.weekIndex!==undefined&&!Number.isSafeInteger(s.weekIndex))||(s.legacySavedDate!==undefined&&typeof s.legacySavedDate!=='boolean'))throw Error('Некорректный или повторяющийся слот календаря');
  seen.add(s.slotId);
 }
 return x;
}
export function readCalendarBackup(storage:Pick<Storage,'getItem'>):CalendarBackup{
 const raw=storage.getItem(EDITORIAL_CALENDAR_KEY);
 return validateCalendarBackup({weeklyAnchor:storage.getItem(WEEKLY_ANCHOR_KEY),editorialSlots:raw===null?null:JSON.parse(raw)});
}
export function mergeCalendarBackup(local:CalendarBackup,incoming:CalendarBackup):CalendarBackup{
 validateCalendarBackup(local);validateCalendarBackup(incoming);
 if(local.weeklyAnchor!==null&&incoming.weeklyAnchor!==null&&local.weeklyAnchor!==incoming.weeklyAnchor)throw Error('Конфликт начала недельного календаря; исходные даты сохранены');
 const records=new Map((local.editorialSlots??[]).map(s=>[s.slotId,s]));
 for(const s of incoming.editorialSlots??[]){
  const old=records.get(s.slotId);
  if(old&&JSON.stringify(old)!==JSON.stringify(s))throw Error('Конфликт сохранённого слота '+s.slotId);
  if(!old)records.set(s.slotId,s);
 }
 return validateCalendarBackup({weeklyAnchor:local.weeklyAnchor??incoming.weeklyAnchor,editorialSlots:local.editorialSlots===null&&incoming.editorialSlots===null?null:[...records.values()]});
}
export function writeCalendarBackup(storage:Pick<Storage,'setItem'>,data:CalendarBackup){
 validateCalendarBackup(data);
 if(data.weeklyAnchor!==null)storage.setItem(WEEKLY_ANCHOR_KEY,data.weeklyAnchor);
 if(data.editorialSlots!==null)storage.setItem(EDITORIAL_CALENDAR_KEY,JSON.stringify(data.editorialSlots));
}
