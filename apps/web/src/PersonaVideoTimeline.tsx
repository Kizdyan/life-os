import React, { useState } from 'react';
interface Clip { id:number; name:string; startSec:number; durationSec:number; sourceDuration:number }
export default function PersonaVideoTimeline() {
 const [clips,setClips]=useState<Clip[]>([]);
 const [fps,setFps]=useState(30);
 const [error,setError]=useState('');
 const [width,setWidth]=useState(1080);
 const [height,setHeight]=useState(1920);
 const [nextId,setNextId]=useState(1);
 async function addFiles(event:React.ChangeEvent<HTMLInputElement>) {
  const files=Array.from(event.target.files||[]).slice(0,30-clips.length);
  if(!files.length)return;
  const additions:Clip[]=[];
  for(const file of files) {
   if(!file.type.startsWith('video/')||file.size>250*1024*1024){setError('Поддерживаются видео до 250 МБ для локального предпросмотра');continue}
   const url=URL.createObjectURL(file);
   try {
    const duration=await new Promise<number>((resolve,reject)=>{
     const video=document.createElement('video');video.preload='metadata';
     video.onloadedmetadata=()=>{const d=video.duration;video.removeAttribute('src');video.load();Number.isFinite(d)&&d>0?resolve(d):reject(Error('Не удалось прочитать длительность'))};
     video.onerror=()=>reject(Error('Невозможно открыть '+file.name));video.src=url;
    });
    additions.push({id:nextId+additions.length,name:file.name,startSec:0,durationSec:Math.min(10,Math.floor(duration*10)/10),sourceDuration:duration});
   }catch(cause){setError(cause instanceof Error?cause.message:'Ошибка чтения файла')}
   finally{URL.revokeObjectURL(url)}
  }
  setClips(old=>[...old,...additions]);setNextId(id=>id+additions.length);
  event.target.value='';
 }
 function change(id:number,patch:Partial<Clip>){setClips(items=>items.map(item=>item.id===id?{...item,...patch}:item))}
 function move(index:number,delta:number){const next=index+delta;if(next<0||next>=clips.length)return;setClips(items=>{const result=[...items];[result[index],result[next]]=[result[next],result[index]];return result})}
 function download() {
  if(clips.length<2){setError('Нужно минимум два видеофрагмента');return}
  if(clips.some(clip=>clip.durationSec<=0||clip.startSec<0||clip.startSec+clip.durationSec>clip.sourceDuration+0.01)){setError('Проверь временные границы клипов');return}
  if(new Set(clips.map(clip=>clip.name)).size!==clips.length){setError('Файлы с одинаковыми именами нужно переименовать до импорта');return}
  const project={version:1,width,height,fps,clips:clips.map(clip=>({path:'./source/'+clip.name,startSec:clip.startSec,durationSec:clip.durationSec}))};
  const blob=new Blob([JSON.stringify(project,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const link=document.createElement('a');
  link.href=url;link.download='persona-timeline.json';document.body.appendChild(link);link.click();link.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),60000);setError('');
 }
 return <section className="captureCard" aria-label="Монтажная последовательность Persona">
  <h3>Монтажная последовательность</h3>
  <p>Собери порядок и тайминги клипов. Сейчас интерфейс экспортирует монтажный проект JSON, а MP4 создаётся локальной командой FFmpeg. Рендер прямо в браузере ещё не подключён.</p>
  <input type="file" multiple accept="video/*" aria-label="Добавить видеофрагменты" onChange={e=>void addFiles(e)}/>
  {clips.map((clip,index)=><div key={clip.id} style={{borderBottom:'1px solid #999',padding:'12px 0'}}>
   <b>{index+1}. {clip.name}</b><p>Исходник: {clip.sourceDuration.toFixed(1)} сек.</p>
   <label>Начало, сек. <input type="number" min="0" max={clip.sourceDuration} step="0.1" value={clip.startSec} onChange={e=>change(clip.id,{startSec:Number(e.target.value)})}/></label>
   <label>Длительность, сек. <input type="number" min="0.1" max={clip.sourceDuration} step="0.1" value={clip.durationSec} onChange={e=>change(clip.id,{durationSec:Number(e.target.value)})}/></label>
   <div style={{display:'flex',gap:8}}>
    <button type="button" disabled={index===0} onClick={()=>move(index,-1)}>Выше</button>
    <button type="button" disabled={index===clips.length-1} onClick={()=>move(index,1)}>Ниже</button>
    <button type="button" onClick={()=>setClips(items=>items.filter(item=>item.id!==clip.id))}>Удалить</button>
   </div>
  </div>)}
  <p>Итого: {clips.reduce((sum,clip)=>sum+clip.durationSec,0).toFixed(1)} сек.</p>
  <label>Ширина <select value={width} onChange={e=>{const w=Number(e.target.value);setWidth(w);setHeight(w===1080?1920:1080)}}><option value={1080}>Вертикальное 1080×1920</option><option value={1920}>Горизонтальное 1920×1080</option></select></label>
  <label>FPS <select value={fps} onChange={e=>setFps(Number(e.target.value))}><option value={25}>25</option><option value={30}>30</option><option value={60}>60</option></select></label>
  <button type="button" className="primary" onClick={download}>Сохранить монтажный проект</button>
  <p>Для рендера помести видео в папку source рядом с JSON и выполни: npm run media:timeline -- persona-timeline.json export.mp4</p>
  {error&&<p role="alert">{error}</p>}
 </section>;
}
