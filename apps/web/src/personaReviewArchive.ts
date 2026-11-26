/** Derived review archives are deliberately separate from original photos.
 * The archived bytes and their evidence never authorize public delivery. */
import type {EditorialPost} from './personaEditorialModel';
import {editorialDesignHash} from './personaEditorialModel';
export type ReviewArchiveEvidence={version:1;contentId:string;revision:number;designHash:string;zipSha256:string;bytes:number;createdAt:string;technical:'TECHNICAL_CHECKS_PASS'|'TECHNICAL_REVIEW_REQUIRED';visual:'BLOCKED'|'REVISION_SUGGESTED'|'AUTHOR_REVIEW_REQUIRED';independence:'MODEL_FAMILY_NOT_VERIFIED';publicationAuthorized:false};
export type ReviewArchiveRecord={key:string;evidence:ReviewArchiveEvidence;blob:Blob};
const DB='persona-editorial-review-archives-v1',STORE='archives',MAX_BYTES=256*1024*1024;
const sha=async(blob:Blob)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))).map(b=>b.toString(16).padStart(2,'0')).join('');
const archiveKey=(contentId:string,revision:number)=>JSON.stringify([contentId,revision]);
export function validateReviewArchive(record:unknown):ReviewArchiveRecord{
 const r=record as ReviewArchiveRecord,e=r?.evidence;
 if(!e||e.version!==1||typeof e.contentId!=='string'||!e.contentId||e.contentId.length>160||
 !Number.isSafeInteger(e.revision)||e.revision<1||r.key!==archiveKey(e.contentId,e.revision)||
 !/^fnv1a32:[a-f0-9]{8}$/.test(e.designHash)||!/^[a-f0-9]{64}$/.test(e.zipSha256)||
 !Number.isFinite(Date.parse(e.createdAt))||!(r.blob instanceof Blob)||r.blob.type!=='application/zip'||
 !Number.isSafeInteger(e.bytes)||e.bytes<22||e.bytes>MAX_BYTES||e.bytes!==r.blob.size||
 !['TECHNICAL_CHECKS_PASS','TECHNICAL_REVIEW_REQUIRED'].includes(e.technical)||
 !['BLOCKED','REVISION_SUGGESTED','AUTHOR_REVIEW_REQUIRED'].includes(e.visual)||
 e.independence!=='MODEL_FAMILY_NOT_VERIFIED'||e.publicationAuthorized!==false)throw Error('Некорректный архив проверки');
 return r;
}
export function archiveMatchesPost(e:ReviewArchiveEvidence,p:EditorialPost){
 return e.contentId===p.id&&e.revision===p.revision&&e.designHash===editorialDesignHash(p);
}
async function withStore<T>(mode:IDBTransactionMode,action:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open(DB,1);
  request.onupgradeneeded=()=>request.result.createObjectStore(STORE,{keyPath:'key'});
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('Архив проверки недоступен'));
  request.onblocked=()=>reject(Error('Архив проверки заблокирован'));
 });
 try{return await new Promise<T>((resolve,reject)=>{
  const tx=db.transaction(STORE,mode),request=action(tx.objectStore(STORE));
  tx.oncomplete=()=>resolve(request.result);tx.onabort=tx.onerror=()=>reject(Error('Не удалось сохранить или прочитать архив проверки'));
 })}finally{db.close()}
}
export async function saveReviewArchive(post:EditorialPost,blob:Blob,quality:Pick<ReviewArchiveEvidence,'technical'|'visual'>){
 const evidence:ReviewArchiveEvidence={version:1,contentId:post.id,revision:post.revision,designHash:editorialDesignHash(post),zipSha256:await sha(blob),bytes:blob.size,createdAt:new Date().toISOString(),...quality,independence:'MODEL_FAMILY_NOT_VERIFIED',publicationAuthorized:false};
 const record=validateReviewArchive({key:archiveKey(post.id,post.revision),evidence,blob});
 // Keep exact current-revision snapshot; no source photos touched.
 await withStore('readwrite',store=>store.put(record));
 return evidence;
}
export async function readReviewArchive(post:EditorialPost):Promise<ReviewArchiveRecord|null>{
 const raw=await withStore('readonly',store=>store.get(archiveKey(post.id,post.revision)));
 if(raw===undefined)return null;
 const r=validateReviewArchive(raw);
 if(!archiveMatchesPost(r.evidence,post))return null;
 if(await sha(r.blob)!==r.evidence.zipSha256)throw Error('Контрольная сумма архива не совпадает');
 return r;
}
