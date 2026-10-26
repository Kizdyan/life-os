import type { Item, Status } from './types';

const RUNTIME='life-os:local-runtime:v1';
const HISTORY='lifeos:persona:idea-history:v2';
const KIND='life-os-device-backup';
const MAX_BYTES=2_000_000;
const MAX_ITEMS=2000;
const ALLOWED=new Set<Status>(['planned','completed','partial','moved','missed_time','not_completed']);
type StorageAccess=Pick<Storage,'getItem'|'setItem'> & {removeItem?:(name:string)=>void};

interface State {schemaVersion:1;items:Item[];plans:Record<string,string[]>}
interface HistoryEntry {title:string;status:'later'|'used'|'rejected'}
interface Portable {kind:typeof KIND;version:1;exportedAt:string;state:State;personaHistory:HistoryEntry[]}
export interface PortableStats { tasks:number; ideas:number }

function object(value:unknown):Record<string,unknown> {
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Повреждённый формат резервной копии.');
  return value as Record<string,unknown>;
}
function text(value:unknown,max:number):string {
  if(typeof value!=='string'||!value.trim()||value.length>max)throw Error('Недопустимое текстовое поле в резервной копии.');
  return value;
}
function datestring(value:unknown):string|null {
  if(value===null)return null;
  if(typeof value!=='string'||value.length>40||!Number.isFinite(Date.parse(value)))
    throw Error('Недопустимая дата задачи.');
  return value;
}
function item(value:unknown):Item {
  const v=object(value),status=v.status;
  if(typeof status!=='string'||!ALLOWED.has(status as Status))
    throw Error('Недопустимый статус задачи.');
  return {
    id:text(v.id,160),title:text(v.title,2000),
    kind:text(v.kind,80),status:status as Status,
    planned_start:datestring(v.planned_start),
    planned_end:datestring(v.planned_end),
    carry_forward:v.carry_forward===true,
  };
}
function state(value:unknown):State {
  const v=object(value);
  if(v.schemaVersion!==1||!Array.isArray(v.items)||v.items.length>MAX_ITEMS)throw Error('Несовместимый формат задач.');
  const items=v.items.map(item),ids=new Set(items.map(x=>x.id));
  if(ids.size!==items.length)throw Error('Повторяющиеся ID задач в архиве.');
  const plans=object(v.plans),keys=Object.keys(plans);
  if(keys.length>MAX_ITEMS)throw Error('Слишком много планов.');
  const normalized:Record<string,string[]>=Object.create(null);
  for(const key of keys) {
    if(key.length>500||key==='__proto__'||key==='constructor'||key==='prototype'||
      !Array.isArray(plans[key])||(plans[key] as unknown[]).length>100)
      throw Error('Некорректный ключ или состав плана.');
    const linked=(plans[key] as unknown[]).map(id=>text(id,160));
    if(linked.some(id=>!ids.has(id)))throw Error('План ссылается на отсутствующую задачу.');
    normalized[key]=linked;
  }
  return {schemaVersion:1,items,plans:normalized};
}
function history(value:unknown):HistoryEntry[] {
  if(!Array.isArray(value)||value.length>MAX_ITEMS)throw Error('Неверная история Persona.');
  return value.map(entry=>{
    const v=object(entry);
    if(v.status!=='later'&&v.status!=='rejected'&&v.status!=='used')throw Error('Неверный статус идеи Persona.');
    return {title:text(v.title,3000),status:v.status};
  });
}
function decode(textValue:string):Portable {
  if(new TextEncoder().encode(textValue).length>MAX_BYTES)throw Error('Архив больше 2 МБ.');
  let decoded:unknown;
  try{decoded=JSON.parse(textValue)}catch{throw Error('Файл не является JSON-архивом Life OS.')}
  const v=object(decoded);
  if(v.kind!==KIND||v.version!==1||typeof v.exportedAt!=='string')
    throw Error('Файл не является совместимой копией Life OS.');
  return {kind:KIND,version:1,exportedAt:v.exportedAt,state:state(v.state),personaHistory:history(v.personaHistory)};
}
function readStored(storage:StorageAccess):Portable {
  const raw=storage.getItem(RUNTIME);
  const oldHistory=storage.getItem(HISTORY);
  const basic=raw===null?{schemaVersion:1,items:[],plans:{}}:JSON.parse(raw);
  const ideas=oldHistory===null?[]:JSON.parse(oldHistory);
  return {kind:KIND,version:1,exportedAt:new Date().toISOString(),state:state(basic),personaHistory:history(ideas)};
}

/** Export ONLY local tasks and Persona idea decisions, never API keys or cloud tokens. */
export function exportDeviceData(storage:StorageAccess):string {
  const payload=JSON.stringify(readStored(storage),null,2);
  if(new TextEncoder().encode(payload).length>MAX_BYTES)throw Error('Локальных данных больше 2 МБ.');
  return payload;
}
/** Emergency export for corrupted local JSON. It is NOT a normal importable backup. */
export function exportEmergencyRawData(storage:StorageAccess):string {
  const snapshot={
    kind:'life-os-raw-recovery',version:1,exportedAt:new Date().toISOString(),
    rawLocalTasks:storage.getItem(RUNTIME),
    rawPersonaHistory:storage.getItem(HISTORY),
  };
  const result=JSON.stringify(snapshot,null,2);
  if(new TextEncoder().encode(result).length>MAX_BYTES)
    throw Error('Повреждённые локальные данные превышают 2 МБ.');
  return result;
}
export function inspectDeviceBackup(raw:string):PortableStats {
  const parsed=decode(raw);
  return {tasks:parsed.state.items.length,ideas:parsed.personaHistory.length};
}

/** Merge by ID/title, never replace a user's existing state or credentials. */
export function importDeviceData(storage:StorageAccess,raw:string):PortableStats {
  const incoming=decode(raw);
  const current=readStored(storage);
  const ids=new Set(current.state.items.map(x=>x.id));
  const added=incoming.state.items.filter(x=>!ids.has(x.id));
  for(const x of added)ids.add(x.id);
  if(added.length+current.state.items.length>MAX_ITEMS)throw Error('Слишком много задач для объединения.');
  const plans={...incoming.state.plans,...current.state.plans};
  // An imported plan must not suppress future scheduling if some of its
  // original items conflict with pre-existing IDs in a different plan.
  const validPlans:Record<string,string[]>=Object.create(null);
  for(const [key,list] of Object.entries(plans)){
    if(list.every(id=>ids.has(id)))validPlans[key]=list;
  }
  const titles=new Set(current.personaHistory.map(x=>x.title.toLocaleLowerCase('ru')));
  const newHistory=incoming.personaHistory.filter(x=>{
    const key=x.title.toLocaleLowerCase('ru');
    if(titles.has(key))return false;
    titles.add(key);return true;
  });
  const mergedHistory=[...current.personaHistory,...newHistory];
  const mergedState:State={
    schemaVersion:1,items:[...current.state.items,...added],plans:validPlans,
  };
  const prevState=storage.getItem(RUNTIME),prevHistory=storage.getItem(HISTORY);
  const nextState=JSON.stringify(mergedState),nextHistory=JSON.stringify(mergedHistory);
  if(new TextEncoder().encode(nextState+nextHistory).length>MAX_BYTES)
    throw Error('Недостаточно места для объединённого архива.');
  try{
    storage.setItem(RUNTIME,nextState);
    storage.setItem(HISTORY,nextHistory);
  }catch(e){
    // Best effort rollback for localStorage quota/browser-denial errors.
    try{
      if(prevState===null)storage.removeItem?.(RUNTIME);
      else storage.setItem(RUNTIME,prevState);
      if(prevHistory===null)storage.removeItem?.(HISTORY);
      else storage.setItem(HISTORY,prevHistory);
    }catch{}
    throw Error('Не удалось записать данные браузера. Оригинальный архив сохранён.');
  }
  return {tasks:added.length,ideas:newHistory.length};
}
