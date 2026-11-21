import {CAROUSEL_BASELINE_ID,CAROUSEL_QUIET_HORROR_ID,editorialArchiveProvenancePass,editorialSourcesPass,type EditorialPost,type EditorialSlide} from './personaEditorialModel';
import '@fontsource/playfair-display/400.css';
import '@fontsource/playfair-display/500.css';
import '@fontsource/playfair-display/400-italic.css';
import '@fontsource/inter/400.css';
import './persona-editorial-fonts.css';
import {paintEditorialHierarchy,type EditorialHierarchy} from './personaEditorialTypography';
import {backgroundAssetUrl,libraryBackground,validCinematicBackground,type CinematicBackground} from './personaEditorialBackgrounds';
import {personaWorkerUrl} from './personaWorkerUrl';

const DB='persona-editorial-assets-v1';
const STORE='images';
export type StoredImage={key:string;name:string;mime:string;bytes:number;blob:Blob};
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
/** Read an original by its existing IndexedDB key. Do not duplicate the blob. */
export async function readEditorialImageByRef(ref:string):Promise<StoredImage|null>{
 if(!/^[-A-Za-z0-9]{3,75}\/[-A-Za-z0-9]{3,75}$/.test(ref))throw Error('Invalid original archive photo key');
 return dbAction<StoredImage|null>('readonly',(store,ok,bad)=>{
  const req=store.get(ref);req.onsuccess=()=>ok(req.result??null);
  req.onerror=()=>bad(Error('Не удалось прочитать исходное фото из архива'));
 });
}
/** Verify actual IndexedDB assets, not merely the submitted string IDs. */
export async function verifyEditorialArchivePhotos(post:EditorialPost):Promise<boolean>{
 if(!post.carouselFormat)return true;
 const photos=post.slides.filter(s=>s.visual==='archive-photo');
 if(!photos.length)return true;
 const entries=await listEditorialImages();
 return editorialArchiveProvenancePass(post,entries.filter(entry=>
  entry.blob instanceof Blob&&entry.bytes===entry.blob.size&&
  ['image/jpeg','image/png'].includes(entry.mime)).map(entry=>entry.key));
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
 filmic:{bg:'#292e30',fg:'#f3e9d6',accent:'#c5af8a',line:'#788080'},
 'chocolate-graphite':{bg:'#2B1D14',fg:'#F2E9DC',accent:'#C9A882',line:'#C9A882'}
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

/** Baseline v2 artist layout. Isolated from every other carousel preset. */
const BASELINE_CHOCOLATE='#2B1D14',BASELINE_GRAPHITE='#1C1C1E',
 BASELINE_CREAM='#F2E9DC',BASELINE_BEIGE='#C9A882';
let baselineFixedGrain:HTMLCanvasElement|null=null;
function baselineGrain():HTMLCanvasElement{
 if(baselineFixedGrain)return baselineFixedGrain;
 const c=document.createElement('canvas');c.width=1080;c.height=1350;
 const ctx=c.getContext('2d');if(!ctx)throw Error('Canvas 2D grain unavailable');
 const pixels=ctx.createImageData(1080,1350);
 // One constant seed, identical independent of slide, run order, or export path.
 let seed=0x1ced2026;
 for(let i=0;i<pixels.data.length;i+=4){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const value=(seed&0x10000)?255:0;
  pixels.data[i]=value;pixels.data[i+1]=value;pixels.data[i+2]=value;
  pixels.data[i+3]=Math.floor(((seed>>>20)&15)*10/15); // 0..10 alpha = up to 3.9%.
 }
 ctx.putImageData(pixels,0,0);baselineFixedGrain=c;return c;
}
function baselineFont(ctx:CanvasRenderingContext2D,size:number,weight:400|500=500){
 ctx.font=weight+' '+size+'px "Playfair Display", Georgia, serif';
 ctx.textBaseline='alphabetic';
}
function baselineLine(ctx:CanvasRenderingContext2D,value:string,x:number,y:number,max=900){
 if(!value.trim())throw Error('Пустой текст в готовой карусели');
 ctx.fillText(value,x,y,max);
}
function baselineTracked(ctx:CanvasRenderingContext2D,text:string,cx:number,y:number,spacing:number){
 const chars=Array.from(text),widths=chars.map(c=>ctx.measureText(c).width);
 const width=widths.reduce((n,v)=>n+v,0)+spacing*(chars.length-1);
 let x=cx-width/2;
 ctx.save();ctx.textAlign='left';
 for(let i=0;i<chars.length;i++){ctx.fillText(chars[i],x,y);x+=widths[i]+spacing}
 ctx.restore();
}
async function renderBaselineArtistSlide(post:EditorialPost,slide:EditorialSlide,index:number):Promise<Blob>{
 if(post.slides.length!==6||index<0||index>5||post.preset!=='chocolate-graphite'||
    slide.visual!=='background'||slide.text!==post.slides[index]?.text)
  throw Error('Неподдерживаемый вариант эталонной карусели');
 const fonts=await Promise.all([
  document.fonts.load('500 100px "Playfair Display"',slide.text),
  document.fonts.load('400 24px "Inter"','А')
 ]);
 if(fonts.some(faces=>faces.length===0))
  throw Error('Локальные шрифты Playfair Display / Inter не загрузились; экспорт остановлен');
 const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas 2D недоступен');
 ctx.fillStyle=index%2===0?BASELINE_CHOCOLATE:BASELINE_GRAPHITE;
 ctx.fillRect(0,0,1080,1350);
 ctx.drawImage(baselineGrain(),0,0);
 ctx.fillStyle=BASELINE_CREAM;ctx.textAlign='left';
 switch(index){
  case 0:
   ctx.strokeStyle=BASELINE_BEIGE;ctx.lineWidth=1;
   ctx.beginPath();ctx.moveTo(90,160.5);ctx.lineTo(522,160.5);ctx.stroke();
   baselineFont(ctx,88);
   baselineLine(ctx,'Пауза — это не',90,928);
   baselineLine(ctx,'отсутствие текста.',90,1051);
   break;
  case 1:
   baselineFont(ctx,72);
   baselineLine(ctx,'Персонаж уже знает ответ.',90,430);
   break;
  case 2:
   ctx.strokeStyle=BASELINE_BEIGE;ctx.lineWidth=1;
   ctx.beginPath();ctx.moveTo(90,1250);ctx.lineTo(990,810);ctx.stroke();
   baselineFont(ctx,80);
   ctx.fillStyle=BASELINE_CREAM;
   baselineLine(ctx,'Но сказать правду',90,465);
   ctx.textAlign='right';ctx.fillStyle=BASELINE_BEIGE;
   baselineLine(ctx,'— значит что-то',990,1020);
   baselineLine(ctx,'потерять.',990,1132);
   break;
  case 3:
   ctx.textAlign='center';
   baselineFont(ctx,84);
   baselineLine(ctx,'Поэтому',540,470);
   baselineLine(ctx,'он',540,654);
   baselineTracked(ctx,'задерживает',540,846,10);
   baselineLine(ctx,'слово.',540,1010);
   break;
  case 4:
   ctx.fillStyle=BASELINE_BEIGE;
   ctx.beginPath();ctx.arc(90,90,4,0,Math.PI*2);ctx.fill();
   ctx.fillStyle=BASELINE_CREAM;ctx.textAlign='center';
   baselineFont(ctx,96);
   baselineLine(ctx,'Зритель замечает',540,622);
   baselineLine(ctx,'этот выбор.',540,757);
   break;
  case 5:
   baselineFont(ctx,100);
   baselineLine(ctx,'Так молчание',90,530);
   baselineLine(ctx,'становится',90,700);
   ctx.fillStyle=BASELINE_BEIGE;
   baselineLine(ctx,'действием.',150,870);
   break;
 }
 // Internal page numbering is forbidden on exported PNG.
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('PNG не создан')),'image/png'));
}

async function renderSlide(post:EditorialPost,slide:EditorialSlide,index:number):Promise<Blob>{
 if(!post.research&&(slide.background||slide.headline!==undefined)&&slide.visual==='background')return renderCinematicSlide(post,slide,index);
 if(post.id===CAROUSEL_QUIET_HORROR_ID&&post.fontPreset==='playfair-inter')
  return renderQuietHorrorSlide(post,slide,index);
 if(post.id===CAROUSEL_BASELINE_ID&&post.fontPreset==='playfair-inter')
  return renderBaselineArtistSlide(post,slide,index);
 const c=document.createElement('canvas');c.width=1080;c.height=1350;
 const ctx=c.getContext('2d');if(!ctx)throw Error('Canvas 2D недоступен');
 const theme=THEMES[post.preset];
 // Only the requested baseline preset alternates backgrounds; all other outputs stay unchanged.
 ctx.fillStyle=post.preset==='chocolate-graphite'&&index%2===1?'#1C1C1E':theme.bg;
 ctx.fillRect(0,0,1080,1350);
 const usePhoto=slide.visual==='archive-photo'||Boolean(slide.background);
 if(usePhoto){
  let imageBlob:Blob;
  if(slide.background)imageBlob=await readCinematicBackground(slide.background);
  else{
  const stored=slide.photoRef?await readEditorialImageByRef(slide.photoRef):
   await readEditorialImage(post.id,slide.id);
  if(!stored)throw Error('Нет фото для слайда №'+(index+1)+'. Выбери изображение из архива.');
   imageBlob=stored.blob;
  }
  let image:ImageBitmap;
  try{image=await createImageBitmap(imageBlob)}catch{throw Error('Повреждено изображение для слайда №'+(index+1))}
  const scale=Math.max(1080/image.width,1350/image.height),w=image.width*scale,h=image.height*scale;
  ctx.drawImage(image,(1080-w)/2,(1350-h)/2,w,h);image.close();
  // Text remains legible in variable photographs without altering the originals.
  const gradient=ctx.createLinearGradient(0,400,0,1350);
  gradient.addColorStop(0,'rgba(5,8,12,.14)');
  gradient.addColorStop(.44,'rgba(5,8,12,.54)');
  gradient.addColorStop(1,'rgba(5,8,12,.85)');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,1080,1350);
 }
 // Imported research renders as exact Canvas typography, never rasterized AI letters.
 // A failed layout aborts export instead of silently cropping the final paragraph.
 if(post.research){
  const faces=await document.fonts.load('500 72px "Playfair Display"',slide.text);
  if(!faces.length)throw Error('Кириллический шрифт не загружен; PNG не создан');
  ctx.drawImage(baselineGrain(),0,0);
  // An author can compose headline / body / optional italic coda with blank lines.
  // This keeps all letters in real browser Canvas instead of asking image AI to draw Cyrillic.
  const editorialBlocks=slide.text.trim().split(/\n\s*\n/u).map(v=>v.trim()).filter(Boolean);
  if(editorialBlocks.length>1){
   if(editorialBlocks.length>3)throw Error('Слайд '+(index+1)+': допускаются три текстовых уровня');
   const fontReady=await Promise.all([
    document.fonts.load('500 82px "Playfair Display"',editorialBlocks[0]),
    document.fonts.load('400 46px "Playfair Display"',editorialBlocks[1]),
    ...(editorialBlocks[2]?[document.fonts.load('italic 400 42px "Playfair Display"',editorialBlocks[2])]:[])
   ]);
   if(fontReady.some(v=>v.length===0))throw Error('Кириллические шрифты не загружены');
   if(usePhoto){
    const shade=ctx.createLinearGradient(0,0,1080,0);
    shade.addColorStop(0,'rgba(5,6,9,.68)');shade.addColorStop(.78,'rgba(5,6,9,.26)');
    shade.addColorStop(1,'rgba(5,6,9,.1)');
    ctx.fillStyle=shade;ctx.fillRect(0,0,1080,1350);
   }
   const left=94,width=880;
   const fitCtx:CanvasRenderingContext2D=ctx; // Narrowed context captured by the nested helper.
   function fit(value:string,weight:400|500,italic:boolean,maxSize:number,minSize:number,height:number,maxLines:number){
    for(let size=maxSize;size>=minSize;size-=2){
     fitCtx.font=(italic?'italic ':'')+weight+' '+size+'px "Playfair Display", Georgia, serif';
     try{
      const lines=wrapText(fitCtx,value,width,maxLines);
      const step=Math.round(size*1.33);
      if(lines.length&&lines.length*step<=height&&lines.every(line=>fitCtx.measureText(line).width<=width))
       return {lines,step,size};
     }catch{/* Try a smaller font; never truncate a line. */}
    }
    throw Error('Слайд '+(index+1)+': текст не помещается в выбранную типографику');
   }
   const headline=fit(editorialBlocks[0],500,false,index===0?88:82,60,335,4);
   const body=fit(editorialBlocks[1],400,false,52,38,editorialBlocks[2]?385:500,9);
   const coda=editorialBlocks[2]?fit(editorialBlocks[2],400,true,46,36,155,3):null;
   ctx.textAlign='left';ctx.textBaseline='top';
   ctx.fillStyle=theme.fg;
   let y=195;
   ctx.font='500 '+headline.size+'px "Playfair Display", Georgia, serif';
   for(const line of headline.lines){ctx.fillText(line,left,y);y+=headline.step}
   if(y>550)throw Error('Слайд '+(index+1)+': заголовок перекрывает основной текст');
   ctx.strokeStyle=theme.accent;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(left,590);ctx.lineTo(left+330,590);ctx.stroke();
   y=625;ctx.font='400 '+body.size+'px "Playfair Display", Georgia, serif';
   for(const line of body.lines){ctx.fillText(line,left,y);y+=body.step}
   if(coda){
    if(y>1090)throw Error('Слайд '+(index+1)+': абзац перекрывает курсивный акцент');
    y=1110;ctx.fillStyle=theme.accent;
    ctx.font='italic 400 '+coda.size+'px "Playfair Display", Georgia, serif';
    for(const line of coda.lines){ctx.fillText(line,left,y);y+=coda.step}
    if(y>1290)throw Error('Слайд '+(index+1)+': курсив выходит за границы');
   }else if(y>1245)throw Error('Слайд '+(index+1)+': текст выходит за границы');
   return new Promise((resolve,reject)=>c.toBlob(blob=>blob?resolve(blob):reject(Error('PNG не создан')),'image/png'));
  }
  ctx.textAlign='left';ctx.textBaseline='alphabetic';
  const width=884,left=96;
  let lines:string[]=[],size=0;
  for(let candidate=index===0?82:70;candidate>=40;candidate-=4){
   ctx.font='500 '+candidate+'px "Playfair Display", Georgia, serif';
   try{
    const wrapped=wrapText(ctx,slide.text,width,12);
    if(wrapped.length*(candidate+20)<=1020){
     size=candidate;lines=wrapped;break;
    }
   }catch{/* Reduce font until the real text fits. */}
  }
  if(!size||!lines.length)throw Error('Слайд '+(index+1)+': текст не помещается без обрезки');
  // Darkened photo backing gives a stable reading surface; no synthetic text or labels.
  if(usePhoto){
   // Avoid the opaque black rectangle that erased actual cinematic photographs.
   // Keep the left-side text readable while revealing the background on the right.
   const sideVeil=ctx.createLinearGradient(0,0,1080,0);
   sideVeil.addColorStop(0,'rgba(5,6,8,.52)');
   sideVeil.addColorStop(.52,'rgba(5,6,8,.26)');
   sideVeil.addColorStop(1,'rgba(5,6,8,.03)');
   ctx.fillStyle=sideVeil;ctx.fillRect(0,0,1080,1350);
  }
  const leading=size+20,top=index===0?300:260;
  const y0=Math.min(Math.max(top,695-(lines.length*leading)/2),1200-(lines.length-1)*leading);
  ctx.fillStyle=theme.fg;
  ctx.font='500 '+size+'px "Playfair Display", Georgia, serif';
  lines.forEach((line,i)=>ctx.fillText(line,left,y0+i*leading));
  return new Promise((resolve,reject)=>c.toBlob(blob=>blob?resolve(blob):reject(Error('PNG не создан')),'image/png'));
 }
 // The final public image contains ONLY authored slide text and the chosen
 // photo/background. Internal Persona labels, section numbers and metadata
 // are never burned into publication pixels.
 if(slide.text.trim()){
  if(usePhoto&&post.carouselFormat){
   // High-opacity dark backing yields contrast independent of the photo pixels.
   let lines:string[]=[],fontSize=68;
   for(;fontSize>=44;fontSize-=4){
    ctx.font='500 '+fontSize+'px "Cormorant Garamond", Georgia, serif';
    try{lines=wrapText(ctx,slide.text,884,2);break}catch{}
   }
   if(!lines.length)throw Error('Подпись слишком длинная для фото-слайда');
   const step=fontSize+15,firstBaseline=1132-(lines.length-1)*step;
   const panelTop=firstBaseline-fontSize-30,panelBottom=1188;
   ctx.fillStyle='rgba(8,10,12,.94)';ctx.fillRect(52,panelTop,976,panelBottom-panelTop);
   ctx.fillStyle=theme.fg;
   lines.forEach((line,i)=>ctx.fillText(line,88,firstBaseline+i*step));
  }else{
   ctx.font='500 80px "Cormorant Garamond", Georgia, serif';
   const lines=wrapText(ctx,slide.text,870,4);
   let y=Math.max(660,1010-lines.length*95);
   ctx.fillStyle=post.preset==='chocolate-graphite'?theme.fg:theme.accent;
   for(const line of lines){ctx.fillText(line,94,y);y+=100}
  }
 }
 return new Promise((resolve,reject)=>c.toBlob(blob=>blob?resolve(blob):reject(Error('PNG не создан')),'image/png'));
}
/** Shared original Canvas renderer; publication ZIPs reuse identical pixels. */
export {renderSlide as renderEditorialSlide};
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
 if(!editorialSourcesPass(post))throw Error('SOURCE_PASS: не все источники исследования подтверждены');
 if(!post.approvals.topic||!post.approvals.content||!post.approvals.design)
  throw Error('Сначала утверди тему, текст и оформление');
 if(!post.caption.trim())throw Error('Для публикации нужен основной текст поста');
 if(post.carouselFormat&&!(await verifyEditorialArchivePhotos(post)))
  throw Error('Пункт 6: фото не найдено в архиве IndexedDB; экспорт заблокирован');
 const files:{name:string;data:Uint8Array}[]=[];
 for(const [i,slide] of post.slides.entries()){
  const blob=await renderSlide(post,slide,i);
  files.push({name:'slide-'+String(i+1).padStart(2,'0')+'.png',
   data:new Uint8Array(await blob.arrayBuffer())});
 }
 // The downloadable caption is paste-ready: no theme/status/approval metadata.
 const caption=post.caption.trim();
 files.push({name:'caption.txt',data:new TextEncoder().encode(caption)});
 if(post.research){
  const sources={
   status:'SOURCE_PASS (manual review, not independent automatic verification)',
   sourceItems:post.research.sourceItems.map(({slideId,title,url,reviewed})=>({slideId,title,url,reviewed})),
   interpretationSlides:post.research.interpretationSlides
  };
  files.push({name:'research-sources.json',data:new TextEncoder().encode(JSON.stringify(sources,null,2))});
 }
 if(post.research||post.slides.some(s=>s.background))files.push({name:'image-provenance.json',data:new TextEncoder().encode(JSON.stringify(await editorialImageProvenance(post),null,2))});
 return zipFileBytes(files);
}
/** Evidence labels describe actual inputs; bundled photographs are never called live generation. */
export async function editorialImageProvenance(post:EditorialPost){
 const sha=async(blob:Blob)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))).map(v=>v.toString(16).padStart(2,'0')).join('');
 return Promise.all(post.slides.map(async s=>{
  if(s.background?.generatedRef){
   const stored=await readEditorialImageByRef(s.background.generatedRef);
   if(!stored)throw Error('Отсутствует оригинал созданного фона');
   const digest=await sha(stored.blob);if(digest!==s.background.sha256)throw Error('SHA-256 фона изменился');
   return {slideId:s.id,source:'provider-generated',sha256:digest,originalRef:s.background.generatedRef,...s.background.provenance};
  }
  if(s.background){
   const response=await fetch(backgroundAssetUrl(s.background));if(!response.ok)throw Error('Нет библиотечного фона');
   return {slideId:s.id,source:'pre-generated-library',libraryId:s.background.libraryId,sha256:await sha(await response.blob()),liveGeneration:false};
  }
  if(s.visual==='archive-photo'){
   const stored=s.photoRef?await readEditorialImageByRef(s.photoRef):await readEditorialImage(post.id,s.id);
   if(!stored)throw Error('Отсутствует оригинал фото из архива');
   return {slideId:s.id,source:'author-archive',originalRef:s.photoRef??key(post.id,s.id),sha256:await sha(stored.blob),liveGeneration:false};
  }
  return {slideId:s.id,source:'image-free-canvas',liveGeneration:false};
 }));
}
export function triggerEditorialDownload(blob:Blob,filename:string){
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=filename;a.style.display='none';
 document.body.appendChild(a);a.click();a.remove();
 window.setTimeout(()=>URL.revokeObjectURL(url),60000);
}

async function renderQuietHorrorSlide(post:EditorialPost,slide:EditorialSlide,index:number):Promise<Blob>{
 if(post.slides.length!==8||index<0||index>7||slide.visual!=='background'||post.preset!=='chocolate-graphite')
  throw Error('Неподдерживаемый вариант карусели');
 const fonts=await Promise.all([document.fonts.load('500 88px "Playfair Display"',slide.text),
  document.fonts.load('400 24px "Inter"','А')]);
 if(fonts.some(f=>f.length===0))throw Error('Шрифты карусели не загрузились');
 const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;
 const c=canvas.getContext('2d');if(!c)throw Error('Canvas недоступен');
 const paintCtx:CanvasRenderingContext2D=c; // Narrowed context captured by both nested helpers.
 c.fillStyle=index%2?BASELINE_GRAPHITE:BASELINE_CHOCOLATE;c.fillRect(0,0,1080,1350);
 c.drawImage(baselineGrain(),0,0);
 c.fillStyle=BASELINE_CREAM;c.strokeStyle=BASELINE_BEIGE;
 function line(x1:number,y1:number,x2:number,y2:number,width=1){
  paintCtx.lineWidth=width;paintCtx.beginPath();paintCtx.moveTo(x1,y1);paintCtx.lineTo(x2,y2);paintCtx.stroke();
 }
 function block(text:string,x:number,y:number,width:number,height:number,size:number,
  align:CanvasTextAlign='left',color=BASELINE_CREAM,leading=1.35,exactLines?:string[]){
  let lines:string[]=[],used=size;
  for(;used>=28;used--){
   paintCtx.font='500 '+used+'px "Playfair Display"';
   lines=exactLines??wrapText(paintCtx,text,width,40);
   if(lines.every(value=>paintCtx.measureText(value).width<=width)&&lines.length*used*leading<=height)break;
  }
  if(used<28)throw Error('Текст не помещается в композицию');
  paintCtx.fillStyle=color;paintCtx.textAlign=align;paintCtx.textBaseline='top';
  const tx=align==='center'?x+width/2:align==='right'?x+width:x;
  lines.forEach((value,i)=>paintCtx.fillText(value,tx,y+i*used*leading));
 }
 switch(index){
  case 0:
   line(90,160.5,522,160.5);
   block(slide.text,90,790,900,390,88,'left',BASELINE_CREAM,1.5,
    slide.text==='Самые страшные сцены в кино часто почти беззвучны.'?
     ['Самые страшные сцены','в кино часто почти беззвучны.']:undefined);
   break;
  case 1:block(slide.text,90,130,900,490,52,'left',BASELINE_CREAM,1.5);break;
  case 2:{
   const parts=slide.text.match(/[^.!?]+[.!?]+|[^.!?]+$/gu)?.map(s=>s.trim())??[slide.text];
   parts.forEach((text,i)=>block(text,90,290+i*250,900,190,56,'center'));break;
  }
  case 3:
   line(91,230,91,350,2);block(slide.text,90,710,900,480,52);break;
  case 4:{
   line(90,1180,990,742.5);
   const split=slide.text.indexOf('Когда');
   block(split>0?slide.text.slice(0,split).trim():slide.text,90,140,790,390,56);
   if(split>0)block(slide.text.slice(split),200,830,790,350,56,'right',BASELINE_BEIGE);
   break;
  }
  case 5:
   c.fillStyle=BASELINE_BEIGE;c.beginPath();c.arc(94,94,4,0,Math.PI*2);c.fill();
   block(slide.text,110,330,860,740,64,'center');break;
  case 6:block(slide.text,150,430,780,530,72,'center');break;
  case 7:
   line(90,910.5,414,910.5);
   block(slide.text,90,950,900,240,44,'left',BASELINE_CREAM,1.5,
    slide.text==='Следующий разбор — про одну ноту, которая меняет финал. Сохраните, если интересно.'?
     ['Следующий разбор — про одну ноту, которая меняет финал.','Сохраните, если интересно.']:undefined);
 }
 // No page numbering inside individual slide PNG.
 return new Promise((ok,no)=>canvas.toBlob(blob=>blob?ok(blob):no(Error('PNG export failed')),'image/png'));
}

export async function quietHorrorContactSheet(images:Blob[]):Promise<Blob>{
 if(images.length!==8)throw Error('Нужны восемь слайдов');
 await document.fonts.load('400 24px "Inter"','01');
 const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=2160;
 const c=canvas.getContext('2d');if(!c)throw Error('Canvas недоступен');
 c.fillStyle=BASELINE_GRAPHITE;c.fillRect(0,0,1080,2160);
 // 4 × (600 + labels) exceeds the requested sheet height. Keep 4:5 thumbnails.
 for(let i=0;i<8;i++){
  const image=await createImageBitmap(images[i]),x=132+(i%2)*416,y=8+Math.floor(i/2)*540;
  c.drawImage(image,x,y,400,500);image.close();
  c.font='400 24px "Inter"';c.textAlign='center';c.fillStyle=BASELINE_CREAM;
  c.fillText(String(i+1).padStart(2,'0'),x+200,y+528);
 }
 return new Promise((ok,no)=>canvas.toBlob(blob=>blob?ok(blob):no(Error('Contact sheet failed')),'image/png'));
}

/** Explicit generation only; browser never receives a provider credential. */
export async function requestEditorialBackground(post:EditorialPost,index:number,{paidConsent=false}={}):Promise<{status:'READY'|'BLOCKED';background?:CinematicBackground;message:string}>{
 const blocked=(message:string)=>({status:'BLOCKED' as const,message});
 if(!paidConsent)return blocked('BLOCKED: нужно отдельное разрешение на один платный запрос. Генерация не выполнена.');
 const direction=post.slides[index]?.photoDirection?.trim();
 if(post.research&&!direction)return blocked('NEEDS_INPUT: заполните визуальное решение этого слайда. Генерация не выполнена.');
 try{
  const health=await fetch(personaWorkerUrl+'/health',{signal:AbortSignal.timeout(3000)});
  if(!health.ok)return blocked('BLOCKED: Worker недоступен. Доступны собственный архив и однотонный фон.');
  const {token}=await health.json();
  if(typeof token!=='string')return blocked('BLOCKED: Worker не выдал локальный токен.');
  const response=await fetch(personaWorkerUrl+'/carousel-background',{method:'POST',
   headers:{'Content-Type':'application/json','X-Persona-Worker-Token':token},
   body:JSON.stringify({theme:post.topic,index,paidConsent:true,...(direction?{visualDirection:direction}:{})}),signal:AbortSignal.timeout(125000)});
  if(!response.ok)return blocked('BLOCKED: генератор недоступен. Генерация не выполнена.');
  const result=await response.json();
  if(result.source!=='openai'||result.status!=='READY')return blocked(result.warning||'BLOCKED: генерация не выполнена. Доступен собственный архив.');
  if(typeof result.pngBase64!=='string'||result.pngBase64.length>20*1024*1024)throw Error('Invalid generated image');
  const bytes=Uint8Array.from(atob(result.pngBase64),c=>c.charCodeAt(0));
  const id='bg-'+crypto.randomUUID();
  const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const background:CinematicBackground={...libraryBackground(index),generatedRef:key(post.id,id),sha256,
   provenance:{provider:'openai',model:result.model,prompt:result.prompt,createdAt:result.createdAt}};
  if(!validCinematicBackground(background))throw Error('Invalid image provenance');
  await saveEditorialImage(post.id,id,new File([bytes],'cinematic-background.png',{type:'image/png'}));
  return {status:'READY',background,message:'Фон создан OpenAI и сохранён локально. Оформление требует вашего утверждения.'};
 }catch{
  return blocked('BLOCKED: Worker или генератор недоступен. Генерация не выполнена. Доступны собственный архив и однотонный фон.');
 }
}

/** Photo-backed editorial composition; the older flat layouts remain byte-compatible. */
async function readCinematicBackground(background:CinematicBackground):Promise<Blob>{
 if(!validCinematicBackground(background))throw Error('Неверная ссылка на кинофон');
 if(background.generatedRef){
  const stored=await readEditorialImageByRef(background.generatedRef);
  if(!stored)throw Error('Созданный фон не найден в локальном архиве');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await stored.blob.arrayBuffer()))).map(v=>v.toString(16).padStart(2,'0')).join('');
  if(hash!==background.sha256)throw Error('Созданный фон изменился; экспорт остановлен');
  return stored.blob;
 }
 const response=await fetch(backgroundAssetUrl(background));if(!response.ok)throw Error('Локальный кинофон не найден');
 return response.blob();
}
async function renderCinematicSlide(post:EditorialPost,slide:EditorialSlide,index:number):Promise<Blob>{
 const background=slide.background;
 if(background&&!validCinematicBackground(background))throw Error('Неверная ссылка на кинофон');
 const fonts=await Promise.all([
  ...(slide.headline!==undefined?[
   document.fonts.load('600 88px "Persona Carousel Cormorant"',slide.text),
   document.fonts.load('700 90px "Persona Carousel Cormorant"',slide.text),
   document.fonts.load('italic 600 48px "Persona Carousel Cormorant"',slide.text),
   document.fonts.load('300 32px "Persona Carousel Inter"',slide.text),
   document.fonts.load('400 24px "Persona Carousel Inter"',slide.text+' 01 / 08')
  ]:[document.fonts.load('500 80px "Playfair Display"',slide.text),document.fonts.load('italic 500 80px "Playfair Display"',slide.text)]),
  ...(slide.headline!==undefined?[]:[document.fonts.load('400 24px "Inter"',slide.text+' 01 / 08')])
 ]);
 if(fonts.some(f=>!f.length))throw Error('Шрифты карусели не загрузились');
 const blob=background?await readCinematicBackground(background):undefined;
 const canvas=document.createElement('canvas');
 canvas.width=1080;canvas.height=1350;
 const c=canvas.getContext('2d');if(!c)throw Error('Canvas недоступен');
 c.fillStyle=index%2?BASELINE_GRAPHITE:BASELINE_CHOCOLATE;c.fillRect(0,0,1080,1350);
 if(blob){
  const image=await createImageBitmap(blob);
  const scale=Math.max(1080/image.width,1350/image.height),width=image.width*scale,height=image.height*scale;
  c.drawImage(image,(1080-width)/2,(1350-height)/2,width,height);image.close();
 }
 // Keep meaningful objects on the right and reserve a genuinely dark text area.
 const bottom=[0,2,3,6,7].includes(index);
 const gradient=bottom?c.createLinearGradient(0,0,0,1350):c.createLinearGradient(0,0,1080,0);
 gradient.addColorStop(0,bottom?'rgba(0,0,0,0)':'rgba(0,0,0,.6)');
 gradient.addColorStop(bottom?.48:.84,'rgba(0,0,0,.6)');
 gradient.addColorStop(1,bottom?'rgba(0,0,0,.6)':'rgba(0,0,0,0)');
 c.fillStyle=gradient;c.fillRect(0,0,1080,1350);
 if(slide.headline!==undefined){
  paintEditorialHierarchy(c,slide as EditorialHierarchy,index);
 }else{
 c.fillStyle=BASELINE_CREAM;c.textBaseline='top';
 const margin=90,maxWidth=index===0?810:860;
 const size=index===0?88:index===6?74:index===7?60:index===5?58:54;
 // Each phrase remains a whole authored paragraph; no AI-rendered glyphs.
 const italic=[3,5,6,7].includes(index);
 c.font=(italic?'italic ':'')+'500 '+size+'px "Playfair Display"';
 const lines=wrapText(c,slide.text,maxWidth,12),leading=size*1.25;
 if(lines.length*leading>860)throw Error('Текст слишком длинный для кинофона');
 const y=bottom?Math.max(610,1190-lines.length*leading):index===5?260:150;
 c.textAlign='left';
 lines.forEach((value,i)=>c.fillText(value,margin,y+i*leading));
 }
 // Publication artwork contains no slide numbers; labels belong to the contact sheet.
 return new Promise((ok,no)=>canvas.toBlob(b=>b?ok(b):no(Error('PNG не создан')),'image/png'));
}
