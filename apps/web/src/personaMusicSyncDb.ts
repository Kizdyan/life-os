/** Browser-local IndexedDB track catalog. Metadata only; no audio upload. */
export type MusicRightsStatus='owned'|'licensed'|'unverified';
export type MusicSyncTrack={
 version:1;id:string;title:string;genre:string;mood:string;durationSec:number;
 stems:boolean;rightsOwner:string;rightsStatus:MusicRightsStatus;
 trackUrl:string;createdAt:string;updatedAt:string;
};
const DB_NAME='lifeos-persona-music-sync';
const STORE='tracks';
const MAX_TRACKS=300;
const str=(value:unknown,max:number)=>typeof value==='string'&&value.trim().length>=2&&value.length<=max;
export function validateMusicSyncTrack(value:unknown):MusicSyncTrack{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Неверная запись трека');
 const t=value as Partial<MusicSyncTrack>;
 if(t.version!==1||typeof t.id!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(t.id)||
  !str(t.title,120)||!str(t.genre,90)||!str(t.mood,90)||!str(t.rightsOwner,180)||
  !Number.isInteger(t.durationSec)||t.durationSec!<1||t.durationSec!>14400||
  typeof t.stems!=='boolean'||!['owned','licensed','unverified'].includes(t.rightsStatus??'' )||
  !Number.isFinite(Date.parse(t.createdAt??''))||!Number.isFinite(Date.parse(t.updatedAt??'')))
  throw Error('Заполни название, жанр, настроение, длительность, стемы и владельца прав');
 try{
  const url=new URL(t.trackUrl??'');
  if(url.protocol!=='https:'||url.username||url.password||url.href.length>2048||!url.hostname.includes('.'))throw Error('bad');
 }catch{throw Error('Ссылка на трек должна быть HTTPS без пароля')}
 return t as MusicSyncTrack;
}
function open():Promise<IDBDatabase>{
 if(typeof indexedDB==='undefined')return Promise.reject(Error('IndexedDB недоступна в этом браузере'));
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB_NAME,1);
  request.onupgradeneeded=()=>{
   const db=request.result;
   if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'});
  };
  request.onerror=()=>reject(Error('Не удалось открыть локальную базу треков'));
  request.onblocked=()=>reject(Error('Закрой вторую вкладку Persona для обновления базы'));
  request.onsuccess=()=>resolve(request.result);
 });
}
async function requestStore<T>(mode:IDBTransactionMode,run:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
 const db=await open();
 return new Promise<T>((resolve,reject)=>{
  let done=false;let result:T;
  const transaction=db.transaction(STORE,mode);
  transaction.oncomplete=()=>{done=true;db.close();resolve(result)};
  transaction.onabort=()=>{if(!done){db.close();reject(Error('Операция с базой музыки прервана'))}};
  transaction.onerror=()=>{if(!done){db.close();reject(Error('Не удалось сохранить данные в IndexedDB'))}};
  try{
   const request=run(transaction.objectStore(STORE));
   request.onsuccess=()=>{result=request.result};
   request.onerror=()=>{if(!done){done=true;db.close();reject(Error('Запрос к локальной базе треков не выполнен'))}};
  }catch(e){done=true;db.close();reject(e)}
 });
}
export async function listMusicSyncTracks():Promise<MusicSyncTrack[]>{
 const list=await requestStore<MusicSyncTrack[]>('readonly',store=>store.getAll());
 if(list.length>MAX_TRACKS)throw Error('Превышен лимит локального каталога');
 return list.map(validateMusicSyncTrack).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
}
export async function saveMusicSyncTrack(track:MusicSyncTrack):Promise<void>{
 const item=validateMusicSyncTrack(track);
 const all=await listMusicSyncTracks();
 if(all.length>=MAX_TRACKS&&!all.some(x=>x.id===item.id))throw Error('Лимит 300 треков');
 await requestStore<IDBValidKey>('readwrite',store=>store.put(item));
}
export async function deleteMusicSyncTrack(id:string):Promise<void>{
 if(!/^[a-zA-Z0-9_-]{1,128}$/.test(id))throw Error('Неверный ID трека');
 await requestStore<undefined>('readwrite',store=>store.delete(id) as IDBRequest<undefined>);
}
export function makeMusicSyncPack(tracks:MusicSyncTrack[]){
 if(!Array.isArray(tracks)||tracks.length>MAX_TRACKS)throw Error('Некорректный список треков');
 const validated=tracks.map(validateMusicSyncTrack);
 if(new Set(validated.map(x=>x.id)).size!==validated.length)throw Error('Повторяющиеся треки');
 return {version:1,kind:'persona-music-sync-packet',professionalUse:'Music supervisors / directors / producers',
  tracks:validated.map(({id,title,genre,mood,durationSec,stems,rightsOwner,rightsStatus,trackUrl})=>({
   id,title,genre,mood,durationSec,stems,rightsOwner,rightsStatus,trackUrl
  })),rightsDisclaimer:'Владелец указан по заявлению автора. Лицензионные права и доступ к стемам требуют отдельного подтверждения; пакет не является лицензией.',
  source:'browser-local-indexeddb',publicationApproved:false};
}
