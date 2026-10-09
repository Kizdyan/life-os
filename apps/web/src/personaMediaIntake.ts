// ZERO-COST media intake. Safari/WebKit does not reliably structured-clone File
// instances into IndexedDB. Persist bounded ArrayBuffer chunks instead, and
// publish the asset manifest only after every chunk transaction committed.
export type CreativeMediaKind = "take"|"photo"|"broll"|"audio"|"additional";
export type CreativeMediaMetadata = {
 id:string;projectId:string;contentItemId:string;ideaId:string;ideaVersion:number;
 sessionId:string;filename:string;mime:string;bytes:number;kind:CreativeMediaKind;
 storage:"device_local";state:"INTAKE_LOCAL";createdAt:string;
};
const DB_NAME="persona-creative-media-v1";
const META="blobs";
const CHUNKS="chunks";
const VERSION=2;
const CHUNK_BYTES=2*1024*1024;
const MAX_FILE_BYTES=5*1024*1024*1024;
function openMediaDb():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  if(typeof indexedDB==="undefined")return reject(new Error("IndexedDB недоступна на этом устройстве"));
  const request=indexedDB.open(DB_NAME,VERSION);
  request.onupgradeneeded=()=>{
   const db=request.result;
   if(!db.objectStoreNames.contains(META))db.createObjectStore(META,{keyPath:"id"});
   if(!db.objectStoreNames.contains(CHUNKS))db.createObjectStore(CHUNKS,{keyPath:"id"});
  };
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||new Error("Не удалось открыть медиахранилище"));
 });
}
function txn(db:IDBDatabase,store:string,mode:IDBTransactionMode,
 action:(s:IDBObjectStore)=>void):Promise<void>{
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(store,mode);
  tx.oncomplete=()=>resolve();
  tx.onerror=()=>reject(tx.error||new Error("Запись не завершена"));
  tx.onabort=()=>reject(tx.error||new Error("Запись не завершена"));
  try{action(tx.objectStore(store));}catch(e){try{tx.abort()}catch{}reject(e);}
 });
}
export function mediaKind(file:File,preferredVideo:"take"|"broll"="take"):CreativeMediaKind{
 if(file.type.startsWith("video/"))return preferredVideo;
 if(file.type.startsWith("image/"))return "photo";
 if(file.type.startsWith("audio/"))return "audio";
 return "additional";
}
export function createMediaMetadata(file:File,params:{
 projectId:string;contentItemId:string;ideaId:string;ideaVersion:number;sessionId:string;
 preferredVideo?:"take"|"broll";
}):CreativeMediaMetadata{
 if(!file||!file.size||file.size>MAX_FILE_BYTES)throw new Error("Файл пустой или превышает лимит 5 ГБ");
 if(!params.projectId||!params.contentItemId||!params.ideaId||!params.sessionId||
 !Number.isInteger(params.ideaVersion)||params.ideaVersion<1)throw new Error("Отсутствует версия утверждённой идеи");
 return {id:crypto.randomUUID().replace(/-/g,""),projectId:params.projectId,
 contentItemId:params.contentItemId,ideaId:params.ideaId,ideaVersion:params.ideaVersion,
 sessionId:params.sessionId,kind:mediaKind(file,params.preferredVideo),
 filename:file.name.slice(0,255),mime:(file.type||"application/octet-stream").slice(0,150),
 bytes:file.size,storage:"device_local",state:"INTAKE_LOCAL",createdAt:new Date().toISOString()};
}
async function clearPartial(db:IDBDatabase,id:string,parts:number){
 for(let i=0;i<parts;i++){
  try{await txn(db,CHUNKS,"readwrite",s=>{s.delete(id+":"+i);});}catch{/* best effort */}
 }
 try{await txn(db,META,"readwrite",s=>{s.delete(id);});}catch{/* best effort */}
}
export async function persistCapturedAsset(meta:CreativeMediaMetadata,file:File):Promise<void>{
 if(file.size!==meta.bytes||file.size<1||file.size>MAX_FILE_BYTES)throw Error("asset_size_mismatch");
 const db=await openMediaDb();
 const count=Math.ceil(file.size/CHUNK_BYTES);
 try{
  // Read a small slice OUTSIDE the transaction, then synchronously request the put.
  // ArrayBuffer is structured-cloneable in WebKit 26 (a native File is not).
  for(let i=0;i<count;i++){
   const offset=i*CHUNK_BYTES;
   const bytes=await file.slice(offset,Math.min(offset+CHUNK_BYTES,file.size)).arrayBuffer();
   if(bytes.byteLength===0)throw Error("empty_media_chunk");
   await txn(db,CHUNKS,"readwrite",s=>{s.put({id:meta.id+":"+i,assetId:meta.id,index:i,bytes});});
  }
  // This is the COMMIT marker: listCapturedAssets never exposes partial uploads.
  await txn(db,META,"readwrite",s=>{s.put({id:meta.id,meta,parts:count,bytes:meta.bytes,storageKind:"arraybuffer-chunks-v2"});});
  // Confirm manifest persisted, not just an onsuccess on put.
  const saved=await getSavedManifest(db,meta.id);
  if(!saved||saved.parts!==count||saved.bytes!==file.size)throw Error("asset_manifest_not_durable");
 }catch(error){await clearPartial(db,meta.id,count);throw error;}
 finally{db.close();}
}
type Manifest={id:string;meta:CreativeMediaMetadata;parts:number;bytes:number;storageKind:string};
function getSavedManifest(db:IDBDatabase,id:string):Promise<Manifest|null>{
 return new Promise((resolve,reject)=>{
  const request=db.transaction(META,"readonly").objectStore(META).get(id);
  request.onsuccess=()=>resolve((request.result as Manifest|undefined)||null);
  request.onerror=()=>reject(request.error||new Error("Локальный материал недоступен"));
 });
}
export async function listCapturedAssets(sessionId:string):Promise<CreativeMediaMetadata[]>{
 const db=await openMediaDb();
 try{return await new Promise((resolve,reject)=>{
  const request=db.transaction(META,"readonly").objectStore(META).getAll();
  request.onsuccess=()=>{
   const records=request.result as Array<Manifest>;
   resolve(records.filter(x=>x?.storageKind==="arraybuffer-chunks-v2" &&
    x?.meta?.sessionId===sessionId && x.parts>0).map(x=>x.meta));
  };
  request.onerror=()=>reject(request.error||new Error("Не удалось прочитать файлы"));
 });}finally{db.close();}
}
export async function hasCapturedAsset(assetId:string):Promise<boolean>{
 const db=await openMediaDb();
 try{return !!(await getSavedManifest(db,assetId));}finally{db.close();}
}
export async function readCapturedAsset(assetId:string):Promise<Blob|null>{
 const db=await openMediaDb();
 try{
  const manifest=await getSavedManifest(db,assetId);
  if(!manifest||manifest.storageKind!=="arraybuffer-chunks-v2")return null;
  const chunks:ArrayBuffer[]=[];
  for(let i=0;i<manifest.parts;i++){
   const part=await new Promise<ArrayBuffer|null>((resolve,reject)=>{
    const req=db.transaction(CHUNKS,"readonly").objectStore(CHUNKS).get(assetId+":"+i);
    req.onsuccess=()=>resolve((req.result?.bytes as ArrayBuffer|undefined)||null);
    req.onerror=()=>reject(req.error||new Error("Не удалось прочитать фрагмент"));
   });
   if(!part)throw Error("asset_chunk_missing");
   chunks.push(part);
  }
  const blob=new Blob(chunks,{type:manifest.meta.mime});
  if(blob.size!==manifest.bytes)throw Error("asset_byte_integrity_failed");
  return blob;
 }finally{db.close();}
}
