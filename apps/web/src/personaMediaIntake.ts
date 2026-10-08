// Real binary intake is local-first. Blobs remain in IndexedDB on this iPhone;
// only minimal, explicitly device-local asset manifests are saved to Shared Brain.
export type CreativeMediaKind = "take"|"photo"|"broll"|"audio"|"additional";
export type CreativeMediaMetadata = {
 id:string;projectId:string;contentItemId:string;ideaId:string;ideaVersion:number;
 sessionId:string;filename:string;mime:string;bytes:number;kind:CreativeMediaKind;
 storage:"device_local";state:"INTAKE_LOCAL";createdAt:string;
};
const DB_NAME="persona-creative-media-v1";
const STORE="blobs";
const VERSION=1;
function openMediaDb():Promise<IDBDatabase> {
 return new Promise((resolve,reject)=>{
  if(typeof indexedDB==="undefined")return reject(new Error("IndexedDB недоступна на этом устройстве"));
  const request=indexedDB.open(DB_NAME,VERSION);
  request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:"id"});};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||new Error("Не удалось открыть медиахранилище"));
 });
}
export function mediaKind(file:File,preferredVideo: "take"|"broll"="take"):CreativeMediaKind {
 if(file.type.startsWith("video/"))return preferredVideo;
 if(file.type.startsWith("image/"))return "photo";
 if(file.type.startsWith("audio/"))return "audio";
 return "additional";
}
export function createMediaMetadata(file:File,params:{
 projectId:string;contentItemId:string;ideaId:string;ideaVersion:number;sessionId:string;
 preferredVideo?:"take"|"broll";
}):CreativeMediaMetadata {
 if(!file||!file.size||file.size>5*1024*1024*1024)throw new Error("Файл пустой или превышает лимит 5 ГБ");
 if(!params.projectId||!params.contentItemId||!params.ideaId||!params.sessionId||
   !Number.isInteger(params.ideaVersion)||params.ideaVersion<1)throw new Error("Отсутствует версия утверждённой идеи");
 return {id:crypto.randomUUID().replace(/-/g,""),projectId:params.projectId,
  contentItemId:params.contentItemId,ideaId:params.ideaId,ideaVersion:params.ideaVersion,
  sessionId:params.sessionId,kind:mediaKind(file,params.preferredVideo),
  filename:file.name.slice(0,255),mime:(file.type||"application/octet-stream").slice(0,150),
  bytes:file.size,storage:"device_local",state:"INTAKE_LOCAL",createdAt:new Date().toISOString()};
}
export async function persistCapturedAsset(meta:CreativeMediaMetadata,file:File):Promise<void>{
 const db=await openMediaDb();
 try{await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction(STORE,"readwrite");
  tx.objectStore(STORE).put({id:meta.id,meta,blob:file});
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error("Запись не завершена"));
  tx.onabort=()=>reject(tx.error||new Error("Хранилище переполнено"));
 });}finally{db.close();}
}
export async function listCapturedAssets(sessionId:string):Promise<CreativeMediaMetadata[]>{
 const db=await openMediaDb();
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,"readonly");
  const request=tx.objectStore(STORE).getAll();
  request.onsuccess=()=>resolve((request.result as Array<{meta:CreativeMediaMetadata}>)
    .map(x=>x.meta).filter(x=>x.sessionId===sessionId));
  request.onerror=()=>reject(request.error||new Error("Не удалось прочитать файлы"));
 });}finally{db.close();}
}
export async function hasCapturedAsset(assetId:string):Promise<boolean>{
 const db=await openMediaDb();
 try{return await new Promise((resolve,reject)=>{
  const request=db.transaction(STORE,"readonly").objectStore(STORE).getKey(assetId);
  request.onsuccess=()=>resolve(request.result!==undefined);
  request.onerror=()=>reject(request.error||new Error("Ошибка локального архива"));
 });}finally{db.close();}
}
