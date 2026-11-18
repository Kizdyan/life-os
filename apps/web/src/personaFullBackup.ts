/**
 * Lossless Persona backup v2: uncompressed ZIP with a legacy Life OS snapshot,
 * all editorial projects, Stories, and original IndexedDB JPEG/PNG bytes.
 * Never exports credentials, never silently drops assets and never overwrites
 * a same-ID draft/photo on restore. Old JSON backups remain importable in UI.
 */
import {
 exportDeviceData,inspectDeviceBackup,importDeviceData,
 type PortableStats
} from './data-portability';
import {
 EDITORIAL_KEY,STORY_KEY,loadEditorialStore,loadStoryNotes,validatePost,
 type EditorialPost,type StoryNote
} from './personaEditorialModel';
import {
 listEditorialImages,readEditorialImage,saveEditorialImage,forgetEditorialImage,
 zipFileBytes,crc32
} from './personaEditorialMedia';
import {
 REFERENCE_LAB_KEY,loadReferenceLab,validateReferenceLab,type ReferenceLabState
} from './personaReferenceWorkflows';

type StorageAccess=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type PhotoManifest={key:string;name:string;mime:'image/png'|'image/jpeg';size:number;sha256:string;file:string};
type BackupManifest={
 kind:'life-os-persona-full-backup';version:2;exportedAt:string;
 legacy:unknown;editorial:{version:1;posts:EditorialPost[]};stories:StoryNote[];
 referenceLab?:ReferenceLabState;
 photos:PhotoManifest[];
};
export type FullBackupStats=PortableStats&{editorial:number;stories:number;photos:number};
const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true});
const MAX_ARCHIVE=512*1024*1024;
const MAIN_FILE='persona-backup.json';
const rollbackKeys=['life-os:local-runtime:v1','lifeos:persona:idea-history:v2',
 'lifeos:persona:projects:v1',EDITORIAL_KEY,STORY_KEY,REFERENCE_LAB_KEY];

function fail(reason:string):never{throw Error('Резервная копия Persona: '+reason)}
function assertImage(m:PhotoManifest){
 if(typeof m.key!=='string'||!/^[-A-Za-z0-9]{3,75}\/[-A-Za-z0-9]{1,100}$/.test(m.key)||
  typeof m.name!=='string'||!m.name||m.name.length>120||
  !['image/png','image/jpeg'].includes(m.mime)||
  !Number.isInteger(m.size)||m.size<1024||m.size>25*1024*1024||
  !/^[0-9a-f]{64}$/.test(m.sha256)||
  !/^images\/[0-9]{4}\.(png|jpg)$/.test(m.file))
  fail('Некорректная запись фотографии');
}
function parseManifest(bytes:Uint8Array):BackupManifest{
 if(bytes.length>3_000_000)fail('Слишком большой манифест');
 let parsed:unknown;
 try{parsed=JSON.parse(dec.decode(bytes))}catch{fail('Повреждённый манифест')}
 const x=parsed as BackupManifest;
 if(!x||x.version!==2||x.kind!=='life-os-persona-full-backup'||
  typeof x.exportedAt!=='string'||!x.legacy||
  !x.editorial||x.editorial.version!==1||!Array.isArray(x.editorial.posts)||
  x.editorial.posts.length>200||!Array.isArray(x.stories)||x.stories.length>250||
  !Array.isArray(x.photos)||x.photos.length>260)fail('Несовместимый манифест');
 // Reuse the strict existing schema and field validation.
 inspectDeviceBackup(JSON.stringify(x.legacy));
 try{
  x.editorial.posts.forEach(validatePost);
  if(x.referenceLab!==undefined)validateReferenceLab(x.referenceLab);
  const ids=x.editorial.posts.map(p=>p.id);
  if(new Set(ids).size!==ids.length)fail('Повторяющиеся ID редакционных проектов');
  const check=loadStoryNotes({getItem:k=>k===STORY_KEY?JSON.stringify(x.stories):null});
  if(check.length!==x.stories.length||new Set(check.map(s=>s.id)).size!==check.length)
   fail('Неверные данные Stories');
 }catch(e){fail('Недопустимые редакционные данные: '+String(e))}
 const keys=new Set<string>(),files=new Set<string>();
 for(const photo of x.photos){
  assertImage(photo);
  if(keys.has(photo.key)||files.has(photo.file))fail('Дублирующаяся фотография');
  keys.add(photo.key);files.add(photo.file);
 }
 return x;
}
async function digest(bytes:Uint8Array):Promise<string>{
 if(!crypto?.subtle)fail('Для проверяемого архива требуется защищённый браузер (WebCrypto)');
 const copy=new Uint8Array(bytes);
 const sha=await crypto.subtle.digest('SHA-256',copy);
 return [...new Uint8Array(sha)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
/** Deterministic bounded ZIP32 reader: only STORE, no encrypted or deflated entries.
 * Verifies all local and central headers and CRCs before importing anything.
 */
function unpack(bytes:Uint8Array):Map<string,Uint8Array>{
 if(bytes.byteLength>MAX_ARCHIVE+2_000_000||bytes.byteLength<22)fail('Недопустимый размер ZIP');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const total=bytes.length;let at=0;
 const map=new Map<string,Uint8Array>(),offsets=new Map<string,number>();
 const u16=(pos:number)=>{if(pos+2>total)fail('Обрыв ZIP');return view.getUint16(pos,true)};
 const u32=(pos:number)=>{if(pos+4>total)fail('Обрыв ZIP');return view.getUint32(pos,true)};
 while(at+4<=total&&u32(at)===0x04034b50){
  if(map.size>=300||at+30>total)fail('Слишком много файлов или обрыв ZIP');
  const flags=u16(at+6),method=u16(at+8),crc=u32(at+14),size=u32(at+18),
   stored=u32(at+22),n=u16(at+26),extra=u16(at+28);
  if(method!==0||size!==stored||flags!==0x0800||n<1||n>255)
   fail('ZIP использует неподдерживаемый или небезопасный формат');
  const start=at+30+n+extra,end=start+size;
  if(end>total||size>MAX_ARCHIVE)fail('Обрезанный ZIP');
  const name=dec.decode(bytes.subarray(at+30,at+30+n));
  if(name!==MAIN_FILE&&!/^images\/[0-9]{4}\.(png|jpg)$/.test(name))
   fail('Неожиданный путь внутри ZIP');
  if(map.has(name))fail('Повторяющийся путь внутри ZIP');
  const data=bytes.subarray(start,end);
  if(crc32(data)!==crc)fail('Контрольная сумма ZIP не совпала');
  map.set(name,data);offsets.set(name,at);at=end;
 }
 const centralStart=at;
 for(let i=0;i<map.size;i++){
  if(at+46>total||u32(at)!==0x02014b50)fail('Нет центрального каталога ZIP');
  if(u16(at+10)!==0||u16(at+8)!==0x0800)fail('Некорректный центральный каталог');
  const n=u16(at+28),extra=u16(at+30),comment=u16(at+32);
  if(at+46+n+extra+comment>total)fail('Обрыв центрального каталога');
  const name=dec.decode(bytes.subarray(at+46,at+46+n));
  if(!map.has(name)||offsets.get(name)!==u32(at+42)||
   map.get(name)!.byteLength!==u32(at+24)||crc32(map.get(name)!)!==u32(at+16))
   fail('ZIP содержит несовпадающие центральные записи');
  at+=46+n+extra+comment;
 }
 if(at+22!==total||u32(at)!==0x06054b50||u16(at+10)!==map.size||
  u16(at+8)!==map.size||u32(at+12)!==at-centralStart||
  u32(at+16)!==centralStart||u16(at+20)!==0)
  fail('ZIP не завершён или содержит лишние данные');
 return map;
}
async function readBackup(blob:Blob):Promise<{manifest:BackupManifest;photos:{meta:PhotoManifest;bytes:Uint8Array}[]}>{
 if(blob.size>MAX_ARCHIVE+2_000_000)fail('Файл превышает 512 МиБ');
 const entries=unpack(new Uint8Array(await blob.arrayBuffer()));
 const raw=entries.get(MAIN_FILE);if(!raw)fail('В ZIP отсутствует манифест');
 const manifest=parseManifest(raw);
 if(entries.size!==manifest.photos.length+1)fail('В ZIP отсутствуют фото или есть неизвестные файлы');
 const photos=[];
 for(const meta of manifest.photos){
  const bytes=entries.get(meta.file);
  if(!bytes||bytes.length!==meta.size||await digest(bytes)!==meta.sha256)
   fail('Фотография повреждена или не соответствует SHA-256: '+meta.key);
  const png=meta.mime==='image/png';
  if(png?!(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71):
   !(bytes[0]===255&&bytes[1]===216&&bytes[2]===255))
   fail('Содержимое фотографии не соответствует формату');
  photos.push({meta,bytes});
 }
 return {manifest,photos};
}
function strictLocal<T>(storage:StorageAccess,k:string,load:(s:Pick<Storage,'getItem'>)=>T,empty:(v:T)=>boolean){
 const raw=storage.getItem(k);if(raw===null)return load(storage);
 let parsed:unknown;
 try{parsed=JSON.parse(raw)}catch{fail('Повреждённые локальные данные '+k+'; экспортируй исходники отдельно')}
 if(k===EDITORIAL_KEY){
  const a=parsed as {version?:number;posts?:unknown[]};
  if(a?.version!==1||!Array.isArray(a.posts)||a.posts.length>200)fail('Неподдерживаемый формат редакции');
 }
 if(k===STORY_KEY&&!Array.isArray(parsed))fail('Неподдерживаемый формат Stories');
 const data=load(storage);
 if(empty(data)){
  const count=k===EDITORIAL_KEY?(parsed as {posts:unknown[]}).posts.length:(parsed as unknown[]).length;
  if(count!==0)fail('Некорректные локальные данные '+k);
 }
 return data;
}
function snapshot(storage:StorageAccess){
 const editorial=strictLocal(storage,EDITORIAL_KEY,loadEditorialStore,x=>x.posts.length===0);
 const stories=strictLocal(storage,STORY_KEY,loadStoryNotes,x=>x.length===0);
 const legacy=JSON.parse(exportDeviceData(storage)) as unknown;
 // Throws rather than silently replacing damaged local data: no partial backup.
 const referenceLab=loadReferenceLab(storage);
 return {legacy,editorial,stories,referenceLab};
}
export async function exportFullPersonaBackup(storage:StorageAccess):Promise<Blob>{
 const data=snapshot(storage);
 const originals=await listEditorialImages();
 const photos:PhotoManifest[]=[],files:{name:string;data:Uint8Array}[]=[];
 let total=0;
 for(let i=0;i<originals.length;i++){
  const p=originals[i];
  if(typeof p.key!=='string'||typeof p.mime!=='string'||!(p.blob instanceof Blob))
   fail('В IndexedDB есть повреждённая фотография. Не создаём неполную копию');
  const original=new Uint8Array(await p.blob.arrayBuffer());
  if(original.length!==p.bytes)fail('Размер фотографии в IndexedDB не совпадает');
  const extension=p.mime==='image/png'?'png':'jpg';
  const path='images/'+String(i+1).padStart(4,'0')+'.'+extension;
  const meta:PhotoManifest={key:p.key,name:p.name,mime:p.mime as PhotoManifest['mime'],
   size:original.length,sha256:await digest(original),file:path};
  assertImage(meta);photos.push(meta);files.push({name:path,data:original});
  total+=original.length;
  if(total>MAX_ARCHIVE-4_000_000)fail('Архив фотографий больше 512 МиБ. Используй архив меньшего объёма');
 }
 const manifest:BackupManifest={kind:'life-os-persona-full-backup',version:2,
  exportedAt:new Date().toISOString(),...data,photos};
 return zipFileBytes([{name:MAIN_FILE,data:enc.encode(JSON.stringify(manifest))},...files]);
}
export async function inspectFullPersonaBackup(blob:Blob):Promise<FullBackupStats>{
 const {manifest}=await readBackup(blob);
 const legacy=inspectDeviceBackup(JSON.stringify(manifest.legacy));
 return {...legacy,editorial:manifest.editorial.posts.length,
  stories:manifest.stories.length,photos:manifest.photos.length};
}
/** Merge-first, fail closed. Existing same-ID photos and drafts are never replaced. */
export async function importFullPersonaBackup(storage:StorageAccess,blob:Blob):Promise<FullBackupStats>{
 const {manifest,photos}=await readBackup(blob);
 const local=snapshot(storage); // raises on corrupt local data, before any writes
 const incomingLab=manifest.referenceLab;
 if(incomingLab!==undefined&&local.referenceLab.revision>1&&
  JSON.stringify(local.referenceLab)!==JSON.stringify(incomingLab)){
  fail('Конфликт исследовательской мастерской. Экспортируй текущий ZIP перед импортом другой версии.');
 }
 const byId=new Map(local.editorial.posts.map(post=>[post.id,post]));
 const addedPosts=manifest.editorial.posts.filter(post=>!byId.has(post.id));
 if(local.editorial.posts.length+addedPosts.length>200)fail('Слишком много редакционных проектов');
 const storyIds=new Set(local.stories.map(story=>story.id));
 const addedStories=manifest.stories.filter(story=>!storyIds.has(story.id));
 if(local.stories.length+addedStories.length>250)fail('Слишком много Stories');
 // Check every photo conflict before writing anything. Do not silently replace
 // the recipient's image even when an imported project shares its ID.
 const pending:{postId:string;slideId:string;name:string;mime:string;bytes:Uint8Array}[]=[];
 for(const {meta,bytes} of photos){
  const separator=meta.key.indexOf('/');
  const postId=meta.key.slice(0,separator),slideId=meta.key.slice(separator+1);
  const existing=await readEditorialImage(postId,slideId);
  if(existing){
   const hash=await digest(new Uint8Array(await existing.blob.arrayBuffer()));
   if(hash!==meta.sha256)fail('Конфликт архивного фото '+meta.key+'; существующий файл не заменён');
  }else pending.push({postId,slideId,name:meta.name,mime:meta.mime,bytes});
 }
 const before=new Map(rollbackKeys.map(k=>[k,storage.getItem(k)]));
 const created:{postId:string;slideId:string}[]=[];
 try{
  for(const p of pending){
   // Full validation (magic, decode, dimensions) is performed by existing
   // storage API; errors abort the entire restore.
   const file=new File([new Uint8Array(p.bytes)],p.name,{type:p.mime});
   await saveEditorialImage(p.postId,p.slideId,file);
   created.push({postId:p.postId,slideId:p.slideId});
  }
  const base=importDeviceData(storage,JSON.stringify(manifest.legacy));
  storage.setItem(EDITORIAL_KEY,JSON.stringify({version:1,posts:[...local.editorial.posts,...addedPosts]}));
  storage.setItem(STORY_KEY,JSON.stringify([...local.stories,...addedStories]));
  if(incomingLab!==undefined&&local.referenceLab.revision===1)
   storage.setItem(REFERENCE_LAB_KEY,JSON.stringify(incomingLab));
  return {...base,editorial:addedPosts.length,stories:addedStories.length,photos:created.length};
 }catch(error){
  // Roll back all localStorage keys as well as newly added IndexedDB records.
  for(const [k,value] of before){
   try{if(value===null)storage.removeItem(k);else storage.setItem(k,value)}catch{}
  }
  for(const p of created.reverse())try{await forgetEditorialImage(p.postId,p.slideId)}catch{}
  throw error;
 }
}
