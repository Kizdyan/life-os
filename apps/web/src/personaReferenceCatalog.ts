/**
 * Local, metadata-only reference library for Persona.
 * Source files never enter storage, uploads or automation.
 */
export type ReferenceKind = 'video' | 'image' | 'document';
export type ReferenceCategory = 'монтаж' | 'цвет' | 'свет' | 'кадр' | 'звук' | 'сценарий' | 'прочее';
export type ReferenceSource = 'files' | 'inventory';
export type ReferenceItem = {
  id: string;
  name: string;
  type: ReferenceKind;
  sizeBytes: number;
  sha256: string | null;
  normalizedStem: string;
  category: ReferenceCategory;
  source: ReferenceSource;
  reviewed: boolean;
  lastModified: number | null;
};
export type ReferenceCatalog = {schemaVersion: 1; items: ReferenceItem[]};
export const REFERENCE_LIBRARY_KEY = 'lifeos:persona:reference-library:v1';
export const REFERENCE_CATEGORIES: ReferenceCategory[] = ['монтаж','цвет','свет','кадр','звук','сценарий','прочее'];
const extensions: Record<string,ReferenceKind> = {
  mp4:'video',mov:'video',m4v:'video',
  jpg:'image',jpeg:'image',png:'image',webp:'image',heic:'image',
  pdf:'document',md:'document',txt:'document',
};
const HASH = /^[a-f0-9]{64}$/;
const MAX_ITEMS = 2000;
function object(value: unknown): value is Record<string,unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function kindForReferenceName(name:string):ReferenceKind|null {
  return extensions[name.split('.').pop()?.toLowerCase() ?? ''] ?? null;
}
export function normalizedReferenceStem(name:string):string {
  return name.replace(/\.[^.]+$/, '').replace(/\s*\(\d+\)$/, '').trim().toLowerCase();
}
export function referenceId(item: Pick<ReferenceItem,'name'|'type'|'sizeBytes'|'sha256'|'lastModified'>): string {
  return JSON.stringify([item.name,item.type,item.sizeBytes,item.sha256 ?? ('unhashed:'+String(item.lastModified ?? 'unknown'))]);
}
export function suggestedReferenceCategory(name:string):ReferenceCategory {
  const lower=name.toLowerCase();
  if(/color|colour|grade|lut|цвет|фильтр|old.?money/.test(lower)) return 'цвет';
  if(/light|lighting|свет|освещ/.test(lower)) return 'свет';
  if(/audio|sound|звук|музык|voice/.test(lower)) return 'звук';
  if(/script|storyboard|сценар|сцен|шотлист/.test(lower)) return 'сценарий';
  if(/edit|reel|montage|transition|монтаж|переход|capcut/.test(lower)) return 'монтаж';
  if(/shot|frame|кадр|ракурс|композици/.test(lower)) return 'кадр';
  return 'прочее';
}
export function makeReferenceItem(input:{
  name:string; type:ReferenceKind; sizeBytes:number;
  sha256?:string|null; lastModified?:number|null; source:ReferenceSource;
}):ReferenceItem {
  if(!input.name || input.name.length>255 || /[\x00-\x1f\/\\]/.test(input.name) ||
    kindForReferenceName(input.name)!==input.type ||
    !Number.isSafeInteger(input.sizeBytes) || input.sizeBytes<0) throw new Error('Некорректный файл в каталоге');
  const sha=input.sha256?.toLowerCase() ?? null;
  if(sha!==null && !HASH.test(sha)) throw new Error('Некорректный SHA-256');
  const lastModified=input.lastModified ?? null;
  if(lastModified!==null && (!Number.isSafeInteger(lastModified) || lastModified<0)) throw new Error('Некорректная дата файла');
  const item:ReferenceItem={
    id:'',name:input.name,type:input.type,sizeBytes:input.sizeBytes,
    sha256:sha,normalizedStem:normalizedReferenceStem(input.name),
    category:suggestedReferenceCategory(input.name),source:input.source,
    reviewed:false,lastModified,
  };
  item.id=referenceId(item);
  return item;
}
export function parseInventoryReport(text:string):ReferenceItem[] {
  if(text.length>3_000_000) throw new Error('Отчёт слишком большой');
  let report:unknown;
  try{report=JSON.parse(text);}catch{throw new Error('Отчёт не является JSON');}
  if(!object(report) || report.schemaVersion!==1 || report.readOnly!==true || !Array.isArray(report.entries))
    throw new Error('Это не отчёт безопасной инвентаризации Persona');
  if(report.entries.length>MAX_ITEMS) throw new Error('Слишком много записей в отчёте');
  return report.entries.map((entry:unknown)=>{
    if(!object(entry) || typeof entry.name!=='string' ||
      (entry.type!=='video' && entry.type!=='image' && entry.type!=='document') ||
      typeof entry.sizeBytes!=='number' || typeof entry.sha256!=='string' ||
      !HASH.test(entry.sha256.toLowerCase()))
      throw new Error('В отчёте обнаружена некорректная запись');
    return makeReferenceItem({
      name:entry.name,type:entry.type,sizeBytes:entry.sizeBytes,
      sha256:entry.sha256,source:'inventory',
    });
  });
}
export function mergeReferenceItems(current:ReferenceItem[], added:ReferenceItem[]):ReferenceItem[] {
  const items=new Map(current.map(item=>[item.id,item]));
  for(const item of added) {
    const before=items.get(item.id);
    items.set(item.id,before ? {...item,category:before.category,reviewed:before.reviewed} : item);
  }
  if(items.size>MAX_ITEMS) throw new Error('В каталоге не может быть более 2000 записей');
  return [...items.values()];
}
export function analyzeReferenceDuplicates(items:ReferenceItem[]) {
  const byHash=new Map<string,ReferenceItem[]>();
  const byName=new Map<string,ReferenceItem[]>();
  for(const item of items) {
    if(item.sha256) byHash.set(item.sha256,[...(byHash.get(item.sha256)??[]),item]);
    const nameKey=item.type+':'+item.normalizedStem;
    byName.set(nameKey,[...(byName.get(nameKey)??[]),item]);
  }
  const exact=[...byHash.values()].filter(group=>group.length>1);
  const candidates=[...byName.values()].filter(group=>
    group.length>1 && new Set(group.map(item=>item.sha256??'unknown:'+item.id)).size>1);
  return {exact,candidates};
}
export function readReferenceCatalog(raw:string|null):ReferenceCatalog {
  if(!raw) return {schemaVersion:1,items:[]};
  try{
    const value:unknown=JSON.parse(raw);
    if(!object(value)||value.schemaVersion!==1||!Array.isArray(value.items)||value.items.length>MAX_ITEMS)
      return {schemaVersion:1,items:[]};
    const items=value.items.map((entry:unknown)=>{
      if(!object(entry) || typeof entry.name!=='string' ||
        (entry.type!=='video'&&entry.type!=='image'&&entry.type!=='document') ||
        typeof entry.sizeBytes!=='number' ||
        (entry.sha256!==null&&typeof entry.sha256!=='string') ||
        (entry.lastModified!==null&&typeof entry.lastModified!=='number') ||
        (entry.source!=='files'&&entry.source!=='inventory') ||
        !REFERENCE_CATEGORIES.includes(entry.category as ReferenceCategory) ||
        typeof entry.reviewed!=='boolean') throw new Error('invalid_item');
      const normalized=makeReferenceItem({
        name:entry.name,type:entry.type,sizeBytes:entry.sizeBytes,
        sha256:entry.sha256 as string|null,lastModified:entry.lastModified as number|null,
        source:entry.source,
      });
      return {...normalized,category:entry.category as ReferenceCategory,reviewed:entry.reviewed};
    });
    return {schemaVersion:1,items:mergeReferenceItems([],items)};
  }catch{return {schemaVersion:1,items:[]};}
}
