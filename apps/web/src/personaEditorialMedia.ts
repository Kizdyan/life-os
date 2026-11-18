import type {EditorialPost,EditorialSlide} from './personaEditorialModel';

const DB='persona-editorial-assets-v1';
const STORE='images';
type StoredImage={key:string;name:string;mime:string;bytes:number;blob:Blob};
const key=(postId:string,slideId:string)=>postId+'/'+slideId;
function openDB():Promise<IDBDatabase>{
 if(typeof indexedDB==='undefined')return Promise.reject(Error('Браузер не поддерживает локальный архив IndexedDB'));
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB,1);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))
   request.result.createObjectStore(STORE,{keyPath:'key'})};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(Error('Не удалось открыть локальный архив фотографий'));
 });
}
async function dbAction<T>(mode:IDBTransactionMode,work:(store:IDBObjectStore,ok:(value:T)=>void,bad:(e:Error)=>void)=>void):Promise<T>{
 const db=await openDB();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,mode);let result:T,hasResult=false,settled=false;
  const ok=(v:T)=>{result=v;hasResult=true};
  const bad=(e:Error)=>{if(!settled){settled=true;reject(e)}};
  tx.oncomplete=()=>{db.close();if(!settled){settled=true;if(hasResult)resolve(result);else reject(Error('Не получен ответ архива'))}};
  tx.onerror=()=>{db.close();bad(Error('Ошибка записи в локальный архив'))};
  tx.onabort=()=>{db.close();bad(Error('Операция в локальном архиве отменена'))};
  try{work(tx.objectStore(STORE),ok,bad)}catch(e){db.close();bad(e instanceof Error?e:Error('Ошибка архива'))}
 });
}
export async function saveEditorialImage(postId:string,slideId:string,file:File){
 if(!['image/jpeg','image/png'].includes(file.type)||file.size<1024||file.size>25*1024*1024)
  throw Error('Нужен настоящий JPEG или PNG размером от 1 КБ до 25 МБ');
 const magic=new Uint8Array(await file.slice(0,12).arrayBuffer());
 if(file.type==='image/png'&&!(magic[0]===137&&magic[1]===80&&magic[2]===78&&magic[3]===71))
  throw Error('Файл не является PNG');
 if(file.type==='image/jpeg'&&!(magic[0]===255&&magic[1]===216&&magic[2]===255))
  throw Error('Файл не является JPEG');
 // Verify the complete image decodes BEFORE accepting it into local storage.
 let bitmap:ImageBitmap;
 try{bitmap=await createImageBitmap(file)}catch{throw Error('Браузер не смог декодировать фотографию')}
 const pixels=bitmap.width*bitmap.height;bitmap.close();
 if(pixels<200000||pixels>40000000)throw Error('Разрешение фотографии слишком маленькое или слишком большое');
 const stored:StoredImage={key:key(postId,slideId),name:file.name.slice(0,120),mime:file.type,bytes:file.size,blob:file};
 await dbAction<void>('readwrite',(store,ok,bad)=>{
  const req=store.put(stored);
  req.onsuccess=()=>ok(undefined);req.onerror=()=>bad(Error('Не удалось сохранить фотографию'));
 });
 return {name:stored.name,bytes:stored.bytes};
}
export async function readEditorialImage(postId:string,slideId:string):Promise<StoredImage|null>{
 return dbAction<StoredImage|null>('readonly',(store,ok,bad)=>{
  const req=store.get(key(postId,slideId));
  req.onsuccess=()=>ok(req.result??null);
  req.onerror=()=>bad(Error('Не удалось получить фотографию из архива'));
 });
}
/** Include all editorial archive assets, including photos temporarily not used in a slide. */
export async function listEditorialImages():Promise<StoredImage[]>{
 return dbAction<StoredImage[]>('readonly',(store,ok,bad)=>{
  const req=store.getAll();
  req.onsuccess=()=>{
   if(!Array.isArray(req.result)||req.result.length>260){
    bad(Error('Слишком много изображений в локальной медиатеке'));return;
   }
   ok(req.result as StoredImage[]);
  };
  req.onerror=()=>bad(Error('Не удалось прочитать локальные фотографии для архива'));
 });
}
export async function forgetEditorialImage(postId:string,slideId:string):Promise<void>{
 await dbAction<void>('readwrite',(store,ok,bad)=>{
  const req=store.delete(key(postId,slideId));
  req.onsuccess=()=>ok(undefined);req.onerror=()=>bad(Error('Не удалось удалить локальный файл'));
 });
}
const THEMES={
 ink:{bg:'#172132',fg:'#f3ead9',accent:'#cdb489',line:'#637182'},
 cream:{bg:'#eee8dc',fg:'#242c33',accent:'#8a6b43',line:'#b8ab9b'},
 chocolate:{bg:'#302720',fg:'#f7eade',accent:'#d3b18a',line:'#77675b'},
 filmic:{bg:'#292e30',fg:'#f3e9d6',accent:'#c5af8a',line:'#788080'}
} as const;
function wrapText(ctx:CanvasRenderingContext2D,text:string,width:number,maxLines:number):string[]{
 const lines:string[]=[];
 for(const block of text.split('\n')){
  let current='';
  for(const word of block.trim().split(/\s+/u).filter(Boolean)){
   const candidate=current?current+' '+word:word;
   if(ctx.measureText(candidate).width>width&&current){lines.push(current);current=word}
   else current=candidate;
   if(lines.length>=maxLines)throw Error('Слишком длинный текст для слайда. Сократи фразу.');
  }
  if(current)lines.push(current);
  if(lines.length>maxLines)throw Error('Слишком длинный текст для слайда. Сократи фразу.');
 }
 return lines;
}
async function renderSlide(post:EditorialPost,slide:EditorialSlide,index:number):Promise<Blob>{
 const c=document.createElement('canvas');c.width=1080;c.height=1350;
 const ctx=c.getContext('2d');if(!ctx)throw Error('Canvas 2D недоступен');
 const theme=THEMES[post.preset];ctx.fillStyle=theme.bg;ctx.fillRect(0,0,1080,1350);
 const usePhoto=slide.visual==='archive-photo';
 if(usePhoto){
  const stored=await readEditorialImage(post.id,slide.id);
  if(!stored)throw Error('Нет фото для слайда №'+(index+1)+'. Выбери изображение из архива.');
  let image:ImageBitmap;
  try{image=await createImageBitmap(stored.blob)}catch{throw Error('Повреждено архивное изображение для слайда №'+(index+1))}
  const scale=Math.max(1080/image.width,1350/image.height),w=image.width*scale,h=image.height*scale;
  ctx.drawImage(image,(1080-w)/2,(1350-h)/2,w,h);image.close();
  // Text remains legible in variable photographs without altering the originals.
  const gradient=ctx.createLinearGradient(0,400,0,1350);
  gradient.addColorStop(0,'rgba(5,8,12,.14)');
  gradient.addColorStop(.44,'rgba(5,8,12,.54)');
  gradient.addColorStop(1,'rgba(5,8,12,.85)');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,1080,1350);
 }
 // The final public image contains ONLY authored slide text and the chosen
 // photo/background. Internal Persona labels, section numbers and metadata
 // are never burned into publication pixels.
 if(slide.text.trim()){
  ctx.font='500 80px "Cormorant Garamond", Georgia, serif';
  const lines=wrapText(ctx,slide.text,870,4);
  let y=Math.max(660,1010-lines.length*95);
  ctx.fillStyle=theme.accent; // Signature Gold title on background or archive photo.
  for(const line of lines){ctx.fillText(line,94,y);y+=100}
 }
 return new Promise((resolve,reject)=>c.toBlob(blob=>blob?resolve(blob):reject(Error('PNG не создан')),'image/png'));
}
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0});
export function crc32(bytes:Uint8Array){
 let c=0xffffffff;for(const n of bytes)c=crcTable[(c^n)&255]^(c>>>8);return (c^0xffffffff)>>>0;
}
export function zipFileBytes(files:{name:string;data:Uint8Array}[]):Blob{
 if(files.length>300)throw Error('Слишком много файлов для экспорта');
 const encoder=new TextEncoder();
 const parts:Uint8Array[]=[],central:Uint8Array[]=[];
 let offset=0,size=0;
 function w16(view:DataView,index:number,v:number){view.setUint16(index,v,true)}
 function w32(view:DataView,index:number,v:number){view.setUint32(index,v>>>0,true)}
 for(const f of files){
  const name=encoder.encode(f.name);
  const hash=crc32(f.data);size+=f.data.length;
  if(size>512*1024*1024||name.length>255)throw Error('Размер ZIP слишком большой (предел 512 МиБ)');
  const local=new Uint8Array(30+name.length),lv=new DataView(local.buffer);
  w32(lv,0,0x04034b50);w16(lv,4,20);w16(lv,6,0x0800);
  w16(lv,8,0);w32(lv,14,hash);w32(lv,18,f.data.length);w32(lv,22,f.data.length);
  w16(lv,26,name.length);local.set(name,30);
  parts.push(local,f.data);
  const center=new Uint8Array(46+name.length),cv=new DataView(center.buffer);
  w32(cv,0,0x02014b50);w16(cv,4,20);w16(cv,6,20);w16(cv,8,0x0800);
  w16(cv,10,0);w32(cv,16,hash);w32(cv,20,f.data.length);w32(cv,24,f.data.length);
  w16(cv,28,name.length);w32(cv,42,offset);center.set(name,46);
  central.push(center);offset+=local.length+f.data.length;
 }
 const centralSize=central.reduce((n,s)=>n+s.length,0);
 const end=new Uint8Array(22),ev=new DataView(end.buffer);
 w32(ev,0,0x06054b50);w16(ev,8,files.length);w16(ev,10,files.length);
 w32(ev,12,centralSize);w32(ev,16,offset);
 // Blob accepts ArrayBuffer-backed views; TS DOM lib may require a concrete copy.
 const items:BlobPart[]=[...parts,...central,end].map(x=>new Uint8Array(x));
 return new Blob(items,{type:'application/zip'});
}
export async function buildEditorialExport(post:EditorialPost):Promise<Blob>{
 if(!post.approvals.topic||!post.approvals.content||!post.approvals.design)
  throw Error('Сначала утверди тему, текст и оформление');
 if(!post.caption.trim())throw Error('Для публикации нужен основной текст поста');
 const files:{name:string;data:Uint8Array}[]=[];
 for(const [i,slide] of post.slides.entries()){
  const blob=await renderSlide(post,slide,i);
  files.push({name:'slide-'+String(i+1).padStart(2,'0')+'.png',
   data:new Uint8Array(await blob.arrayBuffer())});
 }
 // The downloadable caption is paste-ready: no theme/status/approval metadata.
 const caption=post.caption.trim();
 files.push({name:'caption.txt',data:new TextEncoder().encode(caption)});
 return zipFileBytes(files);
}
export function triggerEditorialDownload(blob:Blob,filename:string){
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=filename;a.style.display='none';
 document.body.appendChild(a);a.click();a.remove();
 window.setTimeout(()=>URL.revokeObjectURL(url),60000);
}
