import type {CreativeMediaMetadata} from './personaMediaIntake';
import {partCount,partLength,TRANSFER_CHUNK_BYTES,missingParts} from '../../../packages/core/src/persona-transfer-contract.mjs';

export type ProcessingState='queued'|'processing'|'review'|'ready'|'failed';
export type ProcessingJob={
 id:string;status:ProcessingState;request:{id:string;assetId:string;projectId:string;contentItemId:string;sessionId:string;ideaId:string;ideaVersion:number};
 inputReady:boolean;attempt:number;error:string|null;outputAvailable:boolean;outputUrl?:string;
};
export type WorkerSettings={url:string;token:string};
const SETTINGS_KEY='persona:processing:bridge:v1';

export function validWorkerUrl(raw:string):string|null {
 try{
  const parsed=new URL(raw.trim());
  if(parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/')return null;
  if(parsed.protocol!=='https:' &&
     !(parsed.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)))return null;
  return parsed.origin;
 }catch{return null;}
}
export function getWorkerSettings():WorkerSettings{
 try{
  const data=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}') as Partial<WorkerSettings>;
  return {url:typeof data.url==='string'?data.url:'',token:typeof data.token==='string'?data.token:''};
 }catch{return {url:'',token:''};}
}
export function saveWorkerSettings(settings:WorkerSettings){
 const url=validWorkerUrl(settings.url);
 if(!url||settings.token.length<32)throw Error('Укажи защищённый адрес компьютера и его ключ доступа.');
 localStorage.setItem(SETTINGS_KEY,JSON.stringify({url,token:settings.token}));
}
export function videoMime(asset:Pick<CreativeMediaMetadata,'mime'|'filename'>):string|null{
 const mime=asset.mime.toLowerCase();
 if(mime.startsWith('video/'))return mime;
 // iOS Files sometimes reports an empty/unknown MIME for a valid .MOV.
 // Extension is a tentative hint; the desktop engine must still decode media.
 if(mime!=='application/octet-stream'&&mime!=='')return null;
 if(/\.mov$/i.test(asset.filename))return 'video/quicktime';
 if(/\.mp4$/i.test(asset.filename))return 'video/mp4';
 if(/\.m4v$/i.test(asset.filename))return 'video/x-m4v';
 if(/\.webm$/i.test(asset.filename))return 'video/webm';
 return null;
}
export function processingRequest(asset:CreativeMediaMetadata){
 const mime=videoMime(asset);
 if(!mime)throw Error('Для обработки выбери видео.');
 return {assetId:asset.id,projectId:asset.projectId,contentItemId:asset.contentItemId,
  ideaId:asset.ideaId,ideaVersion:asset.ideaVersion,sessionId:asset.sessionId,
  mime,filename:asset.filename,bytes:asset.bytes};
}
export function jobIdForAsset(assetId:string){
 if(!/^[a-f0-9]{32}$/i.test(assetId))throw Error('Неверный идентификатор файла');
 return 'job-'+assetId.toLowerCase();
}
export function jobBelongsToAsset(job:ProcessingJob|null,asset:CreativeMediaMetadata|undefined):boolean{
 if(!job||!asset||!job.request)return false;
 const r=job.request;
 return job.id===jobIdForAsset(asset.id)&&r.id===job.id&&
  r.assetId===asset.id&&r.projectId===asset.projectId&&
  r.contentItemId===asset.contentItemId&&r.ideaId===asset.ideaId&&
  r.ideaVersion===asset.ideaVersion&&r.sessionId===asset.sessionId;
}
export function safeOutputLink(base:string,job:ProcessingJob):string|null{
 if(!job.outputAvailable||!job.outputUrl||job.status==='failed')return null;
 try{
  const url=new URL(job.outputUrl,base);
  const expected=validWorkerUrl(base);
  if(!expected||url.origin!==expected||
    url.pathname!=='/v1/jobs/'+job.id+'/output'||!/^job-[a-f0-9]{32}$/.test(job.id)||
    !/^[a-f0-9]{64}$/.test(url.searchParams.get('token')||''))return null;
  return url.href;
 }catch{return null;}
}
export async function desktopRequest(settings:WorkerSettings,path:string,
 method:'GET'|'POST'|'PUT',body?:object|Blob):Promise<ProcessingJob>{
 const base=validWorkerUrl(settings.url);
 if(!base||settings.token.length<32)throw Error('Компьютер для обработки не подключён.');
 if(!/^\/v1\/jobs(?:\/job-[a-f0-9]{32}(?:\/(?:input|retry|approve))?)?$/.test(path))
  throw Error('Неподдерживаемое действие с файлом.');
 const isVideo=body instanceof Blob;
 const response=await fetch(base+path,{
  method,headers:{Authorization:'Bearer '+settings.token,
   ...(body&&!isVideo?{'Content-Type':'application/json'}:{}),
   ...(isVideo?{'Content-Type':'application/octet-stream'}:{})},
  body:body?(isVideo?body:JSON.stringify(body)):undefined,
  signal:AbortSignal.timeout(isVideo?900000:20000),
 });
 const payload=await response.json() as ProcessingJob & {error?:string};
 if(!response.ok)throw Error(payload.error||'Не удалось связаться с компьютером.');
 return payload;
}

export type TransferState={id:string;chunkBytes:number;totalParts:number;received:number[];inputReady:boolean};
async function desktopTransferFetch(settings:WorkerSettings,path:string,method:'GET'|'POST'|'PUT',bytes?:Blob,sha?:string){
 const base=validWorkerUrl(settings.url);
 if(!base||settings.token.length<32)throw Error('Компьютер для обработки не подключён.');
 if(!/^\/v1\/jobs\/job-[a-f0-9]{32}\/(?:transfer|commit|chunks\/\d{1,4})$/.test(path))
  throw Error('Неподдерживаемая передача видео');
 const response=await fetch(base+path,{
  method,
  headers:{Authorization:'Bearer '+settings.token,
   ...(sha?{'X-Chunk-SHA256':sha}:{}),
   ...(bytes?{'Content-Type':'application/octet-stream'}:{})},
  body:bytes,signal:AbortSignal.timeout(bytes?120000:20000)
 });
 const body=await response.json();
 if(!response.ok)throw Error(typeof body.error==='string'?body.error:'Не удалось передать видео.');
 return body;
}
export async function transferStatus(settings:WorkerSettings,id:string,bytes:number):Promise<TransferState>{
 const result=await desktopTransferFetch(settings,'/v1/jobs/'+id+'/transfer','GET') as TransferState;
 if(result.id!==id||result.chunkBytes!==TRANSFER_CHUNK_BYTES||result.totalParts!==partCount(bytes)||
    !Array.isArray(result.received))throw Error('Некорректный ответ компьютера.');
 missingParts(bytes,result.received);
 return result;
}
export async function sendChunk(settings:WorkerSettings,id:string,index:number,bytes:number,blob:Blob):Promise<void>{
 if(blob.size!==partLength(bytes,index))throw Error('Повреждён фрагмент видео на iPhone.');
 // Hash one 2 MiB slice only. There is no full-file memory copy or base64.
 const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
 const sha=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
 const result=await desktopTransferFetch(settings,'/v1/jobs/'+id+'/chunks/'+index,'PUT',blob,sha);
 if(result.id!==id||result.index!==index)throw Error('Компьютер подтвердил другой фрагмент.');
}
export async function finishTransfer(settings:WorkerSettings,id:string):Promise<ProcessingJob>{
 return await desktopTransferFetch(settings,'/v1/jobs/'+id+'/commit','POST') as ProcessingJob;
}
