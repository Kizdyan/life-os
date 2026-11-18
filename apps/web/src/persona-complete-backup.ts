/** Complete, explicit Persona device backup. Version 1 task archives remain importable.
 * No cloud uploads, credentials, silent image replacement or partial success.
 */
import {
 exportDeviceData,importDeviceData,inspectDeviceBackup,type PortableStats
} from './data-portability';
import {
 EDITORIAL_KEY,STORY_KEY,validatePost,type EditorialPost,type StoryNote
} from './personaEditorialModel';
import {
 listEditorialImages,readEditorialImage,saveEditorialImage,forgetEditorialImage
} from './personaEditorialMedia';
import {PERSONA_PROJECTS_KEY} from './personaProjectStore';

type LocalStore=Pick<Storage,'getItem'|'setItem'> & {removeItem?:(key:string)=>void};
export type PersonaBackupImage={key:string;name:string;mime:string;bytes:number;blob:Blob};
export type PersonaMediaBackupPort={
 list:()=>Promise<PersonaBackupImage[]>;
 read:(postId:string,slideId:string)=>Promise<PersonaBackupImage|null>;
 save:(postId:string,slideId:string,file:File)=>Promise<unknown>;
 remove:(postId:string,slideId:string)=>Promise<void>;
};
export const personaBackupMedia:PersonaMediaBackupPort={
 list:listEditorialImages,read:readEditorialImage,save:saveEditorialImage,remove:forgetEditorialImage
};
export type PersonaCompleteStats=PortableStats&{
 editorialPosts:number;stories:number;images:number;
};
type ImageRecord={key:string;name:string;mime:'image/png'|'image/jpeg';bytes:number;sha256:string;base64:string};
type CompleteFile={kind:'life-os-persona-complete-backup';version:2;exportedAt:string;
 base:unknown;editorialPosts:EditorialPost[];stories:StoryNote[];images:ImageRecord[]};
const COMPLETE_KIND='life-os-persona-complete-backup';
const MAX_FILE_BYTES=380_000_000; // explicit failure, never silently omit attached images
const MAX_IMAGES=500;
const MAX_EDITORIAL=200;
const MAX_STORIES=250;
const PREVIOUS_KEYS=['life-os:local-runtime:v1','lifeos:persona:idea-history:v2',PERSONA_PROJECTS_KEY,EDITORIAL_KEY,STORY_KEY];
function jsonObject(v:unknown):Record<string,unknown>{
 if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Недопустимый формат полного архива Persona');
 return v as Record<string,unknown>;
}
function parseJson(v:string):unknown{
 try{return JSON.parse(v)}catch{throw Error('Архив Persona не является корректным JSON')}
}
function storedEditorial(storage:Pick<LocalStore,'getItem'>):EditorialPost[]{
 const raw=storage.getItem(EDITORIAL_KEY);
 if(raw===null)return [];
 const value=jsonObject(parseJson(raw));
 if(value.version!==1||!Array.isArray(value.posts)||value.posts.length>MAX_EDITORIAL)
  throw Error('Редакционные данные повреждены — архив без них не создаётся');
 const posts=value.posts as EditorialPost[];
 try{posts.forEach(validatePost)}catch{throw Error('Редакционные данные повреждены — архив без них не создаётся')}
 if(new Set(posts.map(p=>p.id)).size!==posts.length)throw Error('Дубли ID редакционных проектов');
 return posts;
}
function validateStories(v:unknown):StoryNote[]{
 if(!Array.isArray(v)||v.length>MAX_STORIES)throw Error('Неверный формат Stories в архиве');
 for(const s of v){
  if(!s||typeof s!=='object'||typeof s.id!=='string'||!/^[-a-zA-Z0-9]{3,90}$/.test(s.id)||
   typeof s.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s.date)||
   typeof s.text!=='string'||s.text.length<1||s.text.length>350||
   !['idea','captured','published'].includes(s.state)||
   typeof s.createdAt!=='string'||!Number.isFinite(Date.parse(s.createdAt)))
   throw Error('Неверная запись Stories в архиве');
 }
 if(new Set(v.map((x:StoryNote)=>x.id)).size!==v.length)throw Error('Повторяющиеся ID Stories');
 return v as StoryNote[];
}
function storedStories(storage:Pick<LocalStore,'getItem'>):StoryNote[]{
 const raw=storage.getItem(STORY_KEY);
 return raw===null?[]:validateStories(parseJson(raw));
}
function imageIdentity(key:string):{postId:string;slideId:string}{
 if(typeof key!=='string'||!/^[-a-zA-Z0-9]{3,75}\/[-a-zA-Z0-9]{1,80}$/.test(key))
  throw Error('Недопустимый идентификатор архивной фотографии');
 const i=key.indexOf('/');
 return {postId:key.slice(0,i),slideId:key.slice(i+1)};
}
function validateImageMeta(v:unknown):ImageRecord{
 const x=jsonObject(v);
 imageIdentity(x.key as string);
 if(typeof x.name!=='string'||x.name.length<1||x.name.length>120||
  /[\/\\\x00-\x1f]/.test(x.name)||!/\.(png|jpe?g)$/i.test(x.name)||
  (x.mime!=='image/png'&&x.mime!=='image/jpeg')||
  !Number.isSafeInteger(x.bytes)||Number(x.bytes)<1024||Number(x.bytes)>25*1024*1024||
  typeof x.sha256!=='string'||!/^[0-9a-f]{64}$/.test(x.sha256)||
  typeof x.base64!=='string'||x.base64.length!==4*Math.ceil(Number(x.bytes)/3)||
  !/^[A-Za-z0-9+/]*={0,2}$/.test(x.base64))
  throw Error('Недопустимые данные фотографии в архиве');
 return x as ImageRecord;
}
function encode64(bytes:Uint8Array):string{
 // Whole chunks must be divisible by three to concatenate valid base64.
 const parts:string[]=[];
 for(let i=0;i<bytes.length;i+=3*8192)
  parts.push(btoa(String.fromCharCode(...bytes.subarray(i,i+3*8192))));
 return parts.join('');
}
function decode64(data:string):Uint8Array{
 const raw=atob(data),bytes=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
 return bytes;
}
async function digest(bytes:Uint8Array):Promise<string>{
 if(!globalThis.crypto?.subtle)throw Error('Для проверки архива нужен безопасный браузер с Web Crypto');
 const copy=new Uint8Array(bytes.length);copy.set(bytes);
 const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',copy.buffer));
 return Array.from(hash,x=>x.toString(16).padStart(2,'0')).join('');
}
function parseComplete(raw:string):CompleteFile|null{
 if(new Blob([raw]).size>MAX_FILE_BYTES)throw Error('Полный архив слишком большой (>380 МБ)');
 const parsed=jsonObject(parseJson(raw));
 if(parsed.kind==='life-os-device-backup'&&parsed.version===1){
  inspectDeviceBackup(raw);return null;
 }
 if(parsed.kind!==COMPLETE_KIND||parsed.version!==2||
  typeof parsed.exportedAt!=='string'||!Number.isFinite(Date.parse(parsed.exportedAt)))
  throw Error('Неизвестная версия резервной копии Persona');
 const base=parsed.base;
 inspectDeviceBackup(JSON.stringify(base));
 if(!Array.isArray(parsed.editorialPosts)||parsed.editorialPosts.length>MAX_EDITORIAL)
  throw Error('Список каруселей в архиве повреждён');
 const editorialPosts=parsed.editorialPosts as EditorialPost[];
 editorialPosts.forEach(validatePost);
 if(new Set(editorialPosts.map(p=>p.id)).size!==editorialPosts.length)
  throw Error('Повторяющиеся ID редакционных материалов');
 const stories=validateStories(parsed.stories);
 if(!Array.isArray(parsed.images)||parsed.images.length>MAX_IMAGES)
  throw Error('Неверный список фотографий');
 const images=parsed.images.map(validateImageMeta);
 if(new Set(images.map(i=>i.key)).size!==images.length)throw Error('Повторяющиеся файлы в архиве');
 return {kind:COMPLETE_KIND,version:2,exportedAt:parsed.exportedAt,
  base,editorialPosts,stories,images};
}
export function inspectPersonaCompleteBackup(raw:string):PersonaCompleteStats{
 const full=parseComplete(raw);
 const base=full?inspectDeviceBackup(JSON.stringify(full.base)):inspectDeviceBackup(raw);
 return {...base,editorialPosts:full?.editorialPosts.length??0,
  stories:full?.stories.length??0,images:full?.images.length??0};
}
export async function exportPersonaCompleteBackup(
 storage:LocalStore,media:PersonaMediaBackupPort=personaBackupMedia
):Promise<string>{
 const base=parseJson(exportDeviceData(storage));
 const editorialPosts=storedEditorial(storage),stories=storedStories(storage);
 const validIds=new Set(editorialPosts.map(p=>p.id));
 const images=await media.list();
 if(images.length>MAX_IMAGES)throw Error('Слишком много фотографий для одного архива');
 const keys=new Set<string>();
 const result:ImageRecord[]=[];
 for(const image of images){
  const {postId,slideId}=imageIdentity(image.key);
  const post=editorialPosts.find(p=>p.id===postId);
  if(!post||!validIds.has(postId)||!post.slides.some(s=>s.id===slideId))
   continue; // only pictures actually belonging to an editable editorial post
  if(keys.has(image.key))throw Error('Повторяющиеся фотографии в базе');
  keys.add(image.key);
  if(!['image/png','image/jpeg'].includes(image.mime)||image.blob.size!==image.bytes)
   throw Error('Размер или формат архивной фотографии не совпадает');
  const bytes=new Uint8Array(await image.blob.arrayBuffer());
  const name=image.name.trim();
  const record=validateImageMeta({key:image.key,name,mime:image.mime,
   bytes:bytes.length,sha256:await digest(bytes),base64:encode64(bytes)});
  result.push(record);
 }
 // Incomplete drafts without yet-attached photos remain fully restorable as
 // drafts; a file is never invented and an approved design is not publication.
 const payload:CompleteFile={kind:COMPLETE_KIND,version:2,exportedAt:new Date().toISOString(),
  base,editorialPosts,stories,images:result};
 const content=JSON.stringify(payload);
 if(new Blob([content]).size>MAX_FILE_BYTES)
  throw Error('Архив превышает 380 МБ. Ничего не пропущено; сохрани медиа отдельно.');
 return content;
}
function memoryStorage(initial:Map<string,string|null>){
 const data=new Map(initial);
 return {
  getItem:(k:string)=>data.get(k)??null,
  setItem:(k:string,v:string)=>{data.set(k,v)},
  removeItem:(k:string)=>{data.delete(k)}
 };
}
export async function importPersonaCompleteBackup(
 storage:LocalStore,raw:string,media:PersonaMediaBackupPort=personaBackupMedia
):Promise<PersonaCompleteStats>{
 const full=parseComplete(raw);
 if(!full){
  const legacy=importDeviceData(storage,raw);
  return {...legacy,editorialPosts:0,stories:0,images:0};
 }
 const currentEd=storedEditorial(storage),currentStories=storedStories(storage);
 const originals=new Map(PREVIOUS_KEYS.map(k=>[k,storage.getItem(k)]));
 const staged=memoryStorage(originals);
 const restoredBase=importDeviceData(staged,JSON.stringify(full.base));
 const currentPostIds=new Set(currentEd.map(p=>p.id));
 const newPosts=full.editorialPosts.filter(p=>!currentPostIds.has(p.id));
 if(currentEd.length+newPosts.length>MAX_EDITORIAL)throw Error('Слишком много редакционных проектов');
 const mergedPosts=[...currentEd,...newPosts];
 const storyIds=new Set(currentStories.map(s=>s.id));
 const newStories=full.stories.filter(s=>!storyIds.has(s.id));
 if(currentStories.length+newStories.length>MAX_STORIES)throw Error('Слишком много Stories');
 staged.setItem(EDITORIAL_KEY,JSON.stringify({version:1,posts:mergedPosts}));
 staged.setItem(STORY_KEY,JSON.stringify([...currentStories,...newStories]));
 const prepared:{postId:string;slideId:string;name:string;mime:string;bytes:Uint8Array}[]=[];
 for(const image of full.images){
  const {postId,slideId}=imageIdentity(image.key);
  // Existing editorial decisions win; never attach imported photos to a
  // same-ID project that may be independently edited in this browser.
  if(currentPostIds.has(postId))continue;
  if(!newPosts.some(p=>p.id===postId&&p.slides.some(s=>s.id===slideId)))continue;
  const bytes=decode64(image.base64);
  if(bytes.length!==image.bytes||(await digest(bytes))!==image.sha256)
   throw Error('Повреждённая фотография или несовпадение SHA-256: '+image.key);
  prepared.push({...imageIdentity(image.key),name:image.name,mime:image.mime,bytes});
 }
 // Validate EVERY byte and staged local state before writing anything.
 const created:{postId:string;slideId:string}[]=[];
 let written=false;
 try{
  for(const entry of prepared){
   if(await media.read(entry.postId,entry.slideId))continue;
   const bytes=new Uint8Array(entry.bytes.length);bytes.set(entry.bytes);
   const file=new File([bytes.buffer],entry.name,{type:entry.mime});
   await media.save(entry.postId,entry.slideId,file);
   created.push({postId:entry.postId,slideId:entry.slideId});
  }
  written=true;
  for(const k of PREVIOUS_KEYS){
   const next=staged.getItem(k);
   if(next===null)storage.removeItem?.(k);
   else storage.setItem(k,next);
  }
 }catch(e){
  if(written){
   for(const k of PREVIOUS_KEYS){
    try{const old=originals.get(k);if(old===null||old===undefined)storage.removeItem?.(k);
     else storage.setItem(k,old);}catch{}
   }
  }
  for(const added of created.reverse()){
   try{await media.remove(added.postId,added.slideId)}catch{}
  }
  throw e;
 }
 return {...restoredBase,editorialPosts:newPosts.length,stories:newStories.length,images:created.length};
}
