import React, { useEffect, useState } from 'react';
/** Local pixel-only editor: never alters faces, glasses or geometry. */
export default function PersonaPhotoEditor() {
 const [file,setFile]=useState<File|null>(null);
 const [url,setUrl]=useState('');
 const [brightness,setBrightness]=useState(100);
 const [contrast,setContrast]=useState(100);
 const [saturation,setSaturation]=useState(100);
 const [error,setError]=useState('');
 useEffect(()=>{if(!file)return;const u=URL.createObjectURL(file);setUrl(u);return()=>URL.revokeObjectURL(u)},[file]);
 const filter=`brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
 async function exportImage(){
  if(!url||!file)return;
  try{
   const img=new Image();img.src=url;await img.decode();
   if(img.naturalWidth*img.naturalHeight>40000000)throw Error('Изображение слишком большое');
   const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
   const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas недоступен');
   ctx.filter=filter;ctx.drawImage(img,0,0);
   const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Ошибка PNG')),'image/png'));
   const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download='persona-photo.png';a.click();
   window.setTimeout(()=>URL.revokeObjectURL(u),60000);setError('');
  }catch(e){setError(e instanceof Error?e.message:'Ошибка экспорта')}
 }
 return <section className="captureCard"><h3>Локальная цветокоррекция фото</h3><p>Без перерисовки лица и изменения геометрии. Оригинал не изменяется.</p>
 <input type="file" accept="image/*" aria-label="Исходное фото" onChange={e=>{const f=e.target.files?.[0];if(f&&f.type.startsWith('image/')&&f.size<=30000000){setFile(f);setError('')}else setError('Нужно изображение до 30 МБ')}}/>
 {url&&<div><img src={url} alt="Предпросмотр" style={{width:'100%',maxHeight:440,objectFit:'contain',filter}}/>
 {([['Яркость',brightness,setBrightness],['Контраст',contrast,setContrast],['Насыщенность',saturation,setSaturation]] as const).map(([name,value,change])=><label key={name} style={{display:'block'}}>{name}: {value}<input type="range" min="0" max="160" value={value} onChange={e=>change(Number(e.target.value))}/></label>)}
 <button type="button" onClick={()=>{setBrightness(100);setContrast(100);setSaturation(100)}}>Сброс</button>
 <button type="button" onClick={()=>void exportImage()}>Экспорт PNG</button></div>}
 {error&&<p role="alert">{error}</p>}</section>
}
