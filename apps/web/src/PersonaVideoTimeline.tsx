import React, { useEffect, useRef, useState } from 'react';
interface Clip { id:number; name:string; startSec:number; durationSec:number; sourceDuration:number }
export default function PersonaVideoTimeline({projectId}:{projectId:string}) {
 const storageKey='persona:timeline:draft:v1:'+projectId;
 const urls=useRef(new Map<number,string>());
 const filesById=useRef(new Map<number,File>());
 const [previewId,setPreviewId]=useState<number|null>(null);
 const [playSequence,setPlaySequence]=useState(false);
 const [renderState,setRenderState]=useState('');
 const [musicAccents,setMusicAccents]=useState<number[]>([]);
 const musicFile=useRef<File|null>(null);
 const [musicVolume,setMusicVolume]=useState(0.35);
 const [originalVolume,setOriginalVolume]=useState(1);
 const [musicStatus,setMusicStatus]=useState('');
 const [rendering,setRendering]=useState(false);
 useEffect(()=>()=>{for(const url of urls.current.values())URL.revokeObjectURL(url);urls.current.clear();filesById.current.clear()},[]);
 const [clips,setClips]=useState<Clip[]>(()=>{try{const raw=JSON.parse(localStorage.getItem(storageKey)||'[]');return Array.isArray(raw)?raw.filter(item=>typeof item?.name==='string'&&Number.isFinite(item?.durationSec)&&Number.isFinite(item?.sourceDuration)&&Number.isFinite(item?.startSec)&&Number.isInteger(item?.id)).slice(0,30):[]}catch{return []}});
 const [fps,setFps]=useState(30);
 const [error,setError]=useState('');
 const [width,setWidth]=useState(1080);
 const [height,setHeight]=useState(1920);
 const [nextId,setNextId]=useState(()=>{try{const items=JSON.parse(localStorage.getItem(storageKey)||'[]');return Array.isArray(items)?Math.max(0,...items.map(item=>Number(item?.id)||0))+1:1}catch{return 1}});
 useEffect(()=>{try{localStorage.setItem(storageKey,JSON.stringify(clips))}catch{}},[clips,storageKey]);
 async function addFiles(event:React.ChangeEvent<HTMLInputElement>) {
  const files=Array.from(event.target.files||[]).slice(0,30);
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
    const old=clips.find(clip=>clip.name===file.name&&!urls.current.has(clip.id));
    if(old){
      if(Math.abs(old.sourceDuration-duration)>0.5){setError('Длительность файла '+file.name+' отличается от сохранённого исходника');continue}
      urls.current.set(old.id,URL.createObjectURL(file));filesById.current.set(old.id,file);
      setPreviewId(old.id);
      continue;
    }
    if(clips.some(clip=>clip.name===file.name)||additions.some(clip=>clip.name===file.name)){setError('Файл '+file.name+' уже добавлен');continue}
    if(clips.length+additions.length>=30){setError('Достигнут лимит в 30 клипов');continue}
    const id=nextId+additions.length;
    additions.push({id,name:file.name,startSec:0,durationSec:Math.min(10,Math.floor(duration*10)/10),sourceDuration:duration});
    urls.current.set(id,URL.createObjectURL(file));filesById.current.set(id,file);
   }catch(cause){setError(cause instanceof Error?cause.message:'Ошибка чтения файла')}
   finally{URL.revokeObjectURL(url)}
  }
  if(additions.length)setPreviewId(additions[0].id);
  setClips(old=>[...old,...additions]);setNextId(id=>id+additions.length);
  event.target.value='';
 }
 function advanceSequence(){const i=clips.findIndex(c=>c.id===previewId);if(i+1<clips.length)setPreviewId(clips[i+1].id);else setPlaySequence(false)}
 function removeClip(id:number){setPlaySequence(false);const url=urls.current.get(id);if(url)URL.revokeObjectURL(url);urls.current.delete(id);filesById.current.delete(id);if(previewId===id)setPreviewId(null);setClips(items=>items.filter(item=>item.id!==id))}
 function change(id:number,patch:Partial<Clip>){setPlaySequence(false);setClips(items=>items.map(item=>item.id===id?{...item,...patch}:item))}
 function move(index:number,delta:number){setPlaySequence(false);const next=index+delta;if(next<0||next>=clips.length)return;setClips(items=>{const result=[...items];[result[index],result[next]]=[result[next],result[index]];return result})}
 async function analyzeMusic(file:File|undefined){
  if(!file)return;
  setError('');setMusicStatus('Анализ аудио…');setMusicAccents([]);
  try{
   if(file.size>80*1024*1024)throw new Error('Аудиофайл должен быть меньше 80 МБ');
   const AudioContextCtor=window.AudioContext;
   if(!AudioContextCtor)throw new Error('Браузер не поддерживает анализ аудио');
   const context=new AudioContextCtor();
   let audio:AudioBuffer;
   try{audio=await context.decodeAudioData(await file.arrayBuffer())}finally{await context.close()}
   const rate=audio.sampleRate, hop=Math.max(256,Math.round(rate*0.025)), windowSize=hop*2;
   const channels=Array.from({length:audio.numberOfChannels},(_,i)=>audio.getChannelData(i));
   const rms:number[]=[];
   for(let pos=0;pos+windowSize<audio.length;pos+=hop){
    let sum=0;
    for(let j=pos;j<pos+windowSize;j+=2){
     let value=0;for(const channel of channels)value+=channel[j]/channels.length;
     sum+=value*value;
    }
    rms.push(Math.sqrt(sum/Math.ceil(windowSize/2)));
   }
   const flux=rms.map((v,i)=>Math.max(0,v-(rms[i-1]??0)));
   const points:{time:number;strength:number}[]=[];
   for(let i=12;i<flux.length-12;i++){
    const local=flux.slice(i-12,i+13);
    const mean=local.reduce((a,b)=>a+b,0)/local.length;
    const variance=local.reduce((a,b)=>a+(b-mean)**2,0)/local.length;
    if(flux[i]>Math.max(0.002,mean+1.2*Math.sqrt(variance))&&flux[i]>=flux[i-1]&&flux[i]>flux[i+1])
     points.push({time:i*hop/rate,strength:flux[i]});
   }
   const selected:{time:number;strength:number}[]=[];
   for(const point of points.sort((a,b)=>b.strength-a.strength)){
    if(selected.every(other=>Math.abs(other.time-point.time)>=0.2))selected.push(point);
   }
   const times=selected.map(p=>Number(p.time.toFixed(3))).sort((a,b)=>a-b);
   setMusicAccents(times);setMusicStatus('Найдено музыкальных акцентов: '+times.length+'. Это кандидаты, а не обязательные склейки.');
  }catch(e){setMusicStatus('');setError(e instanceof Error?e.message:'Не удалось проанализировать музыку')}
 }
 function alignCutsToMusic(){
  if(!musicAccents.length||clips.length<2){setError('Нет музыкальных акцентов или недостаточно клипов');return}
  const total=clips.reduce((s,c)=>s+c.durationSec,0);
  const boundaries:number[]=[];let cumulative=0;
  for(const clip of clips.slice(0,-1)){cumulative+=clip.durationSec;boundaries.push(cumulative)}
  const used=new Set<number>();let previous=0;
  const snapped:number[]=[];
  for(let i=0;i<boundaries.length;i++){
   const target=boundaries[i];
   const remaining=clips.length-i-1;
   const candidates=musicAccents.filter(t=>!used.has(t)&&t>previous+0.25&&t<total-remaining*0.25&&Math.abs(t-target)<=0.65);
   if(!candidates.length){setError('Не удалось согласовать все склейки с акцентами в пределах 0,65 сек. Таймлайн не изменён.');return}
   const chosen=candidates.reduce((best,t)=>Math.abs(t-target)<Math.abs(best-target)?t:best);
   snapped.push(chosen);used.add(chosen);previous=chosen;
  }
  const lengths=clips.map((_,i)=>Number(((snapped[i]??total)-(snapped[i-1]??0)).toFixed(3)));
  if(lengths.some((length,i)=>length<0.25||length>clips[i].sourceDuration-clips[i].startSec+0.001)){
   setError('Для выбранных музыкальных акцентов не хватает исходного видео. Таймлайн не изменён.');return;
  }
  setClips(old=>old.map((clip,i)=>({...clip,durationSec:lengths[i]})));
  setError('');setMusicStatus('Границы клипов скорректированы по музыкальным акцентам. Проверь монтаж перед рендером.');
 }
 async function renderLocal(){
  if(rendering)return;
  if(clips.length<2||clips.some(c=>!filesById.current.has(c.id))){setError('Загрузи все исходники перед рендером');return}
  if(clips.some(c=>c.durationSec<=0||c.startSec<0||c.startSec+c.durationSec>c.sourceDuration+0.01)){setError('Проверь тайминги');return}
  setRendering(true);setError('');
  const base='http://127.0.0.1:47831';
  let token='';
  async function request(path:string,init?:RequestInit){
   const headers=new Headers(init?.headers);
   if(token)headers.set('X-Persona-Token',token);
   const response=await fetch(base+path,{...init,headers});
   if(!response.ok){const info=await response.json().catch(()=>({error:'Ошибка локального сервера'}));throw new Error(info.error||'Ошибка рендера')}
   return response;
  }
  let sessionId:string|undefined;
  try{
   setRenderState('Подключение к локальному FFmpeg...');
   const health=await (await request('/health')).json();
   if(!health.ok||typeof health.token!=='string')throw new Error('Локальный обработчик не готов');
   token=health.token;
   const project={version:1,width,height,fps,clips:clips.map(c=>({startSec:c.startSec,durationSec:c.durationSec})),...(musicFile.current?{soundtrack:{startSec:0,volume:musicVolume,originalVolume}}:{})};
   const created=await (await request('/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(project)})).json();
   sessionId=created.id;
   for(let i=0;i<clips.length;i++){
    setRenderState('Загрузка исходника '+(i+1)+' из '+clips.length);
    await request('/session/'+created.id+'/clip/'+i,{method:'PUT',body:filesById.current.get(clips[i].id)!});
   }
   if(musicFile.current){setRenderState('Передача музыкальной дорожки...');await request('/session/'+created.id+'/music',{method:'PUT',body:musicFile.current});}
   setRenderState('FFmpeg собирает MP4...');
   await request('/session/'+created.id+'/render',{method:'POST'});
   setRenderState('Получение готового видео...');
   const video=await (await request('/session/'+created.id+'/download')).blob();
   const url=URL.createObjectURL(video),link=document.createElement('a');
   link.href=url;link.download='persona-render.mp4';document.body.appendChild(link);link.click();link.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),60000);
   setRenderState('MP4 создан и передан на скачивание. Перед публикацией требуется проверка и утверждение.');
  }catch(e){setRenderState('');setError(e instanceof Error?e.message:'Не удалось создать MP4. Запусти локальный мост: npm run media:bridge')}
  finally{if(sessionId){try{await request('/session/'+sessionId,{method:'DELETE'})}catch{}}setRendering(false)}
 }
 function download() {
  if(clips.length<2){setError('Нужно минимум два видеофрагмента');return}
  if(clips.some(clip=>!urls.current.has(clip.id))){setError('После перезагрузки исходники недоступны. Повторно выберите исходные файлы.');return}
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
  <p>Собери порядок и тайминги клипов. Сейчас интерфейс экспортирует монтажный проект JSON, а MP4 создаётся локальной командой FFmpeg. Для рендера из интерфейса запусти локальный мост: node tools/persona-render-bridge.mjs. Исходники передаются только на 127.0.0.1.</p>
  <input type="file" multiple accept="video/*" aria-label="Добавить видеофрагменты" onChange={e=>void addFiles(e)}/>
  <div><label>Музыка для анализа ритма <input type="file" accept="audio/*" aria-label="Выбрать музыкальную дорожку" onChange={e=>void analyzeMusic(e.target.files?.[0])}/></label>
  <button type="button" disabled={!musicAccents.length||clips.length<2} onClick={alignCutsToMusic}>Подстроить склейки под музыку</button>
  {musicStatus&&<p role="status">{musicStatus}</p>}
  <p>Анализ выполняется в браузере. При локальном рендере выбранная музыка добавляется в MP4 с громкостью 80%, исходный звук клипов приглушается до 20%. Проверь права на музыку и финальный звук.</p></div>
  {clips.some(clip=>!urls.current.has(clip.id))&&<p role="alert">Часть исходников не загружена. Повторно выбери файлы с прежними именами: тайминги и порядок сохранятся, если длительность совпадает.</p>}
  {clips.map((clip,index)=><div key={clip.id} style={{borderBottom:'1px solid #999',padding:'12px 0'}}>
   <b>{index+1}. {clip.name}</b><p>Исходник: {clip.sourceDuration.toFixed(1)} сек.</p>
   <label>Начало, сек. <input type="number" min="0" max={clip.sourceDuration} step="0.1" value={clip.startSec} onChange={e=>change(clip.id,{startSec:Number(e.target.value)})}/></label>
   <label>Длительность, сек. <input type="number" min="0.1" max={clip.sourceDuration} step="0.1" value={clip.durationSec} onChange={e=>change(clip.id,{durationSec:Number(e.target.value)})}/></label>
   <div style={{display:'flex',gap:8}}>
    <button type="button" disabled={index===0} onClick={()=>move(index,-1)}>Выше</button>
    <button type="button" disabled={index===clips.length-1} onClick={()=>move(index,1)}>Ниже</button>
    <button type="button" disabled={!urls.current.has(clip.id)} onClick={()=>setPreviewId(clip.id)}>Предпросмотр</button>
    <button type="button" onClick={()=>removeClip(clip.id)}>Удалить</button>
   </div>
  </div>)}
  <button type="button" onClick={()=>{setPlaySequence(true);setPreviewId(clips[0]?.id??null)}} disabled={clips.length<2||clips.some(c=>!urls.current.has(c.id))}>Смотреть последовательность</button>
  {playSequence&&<button type="button" onClick={()=>setPlaySequence(false)}>Остановить последовательность</button>}
  {previewId!==null&&urls.current.has(previewId)&&<div><p>Исходник (не готовый монтаж)</p><video key={previewId} controls playsInline autoPlay={playSequence} preload="metadata" onLoadedMetadata={e=>{if(playSequence){const clip=clips.find(c=>c.id===previewId);if(clip)e.currentTarget.currentTime=clip.startSec}}} onTimeUpdate={e=>{if(!playSequence)return;const clip=clips.find(c=>c.id===previewId);if(clip&&e.currentTarget.currentTime>=clip.startSec+clip.durationSec-0.04){e.currentTarget.pause();advanceSequence()}}} onEnded={()=>{if(playSequence)advanceSequence()}} src={urls.current.get(previewId)} style={{width:'100%',maxWidth:360,maxHeight:440}}/></div>}
  <p>Предпросмотр не является готовым MP4: переходы между файлами могут иметь паузы.</p>
  <p>Итого: {clips.reduce((sum,clip)=>sum+clip.durationSec,0).toFixed(1)} сек.</p>
  <label>Ширина <select value={width} onChange={e=>{const w=Number(e.target.value);setWidth(w);setHeight(w===1080?1920:1080)}}><option value={1080}>Вертикальное 1080×1920</option><option value={1920}>Горизонтальное 1920×1080</option></select></label>
  <label>FPS <select value={fps} onChange={e=>setFps(Number(e.target.value))}><option value={25}>25</option><option value={30}>30</option><option value={60}>60</option></select></label>
  <button type="button" className="primary" onClick={download}>Сохранить монтажный проект</button>
  <p>Для создания MP4 открой второй терминал в папке проекта и выполни <code>npm run media:bridge</code>. FFmpeg и FFprobe должны быть установлены на компьютере. Веб-интерфейс запускай локально через <code>npm run web:dev</code>.</p>
  <button type="button" disabled={rendering} onClick={()=>void renderLocal()}>{rendering?'Создание MP4…':'Создать MP4 через локальный FFmpeg'}</button>
  {renderState&&<p role="status">{renderState}</p>}
  <p>После обновления страницы исходные видео необходимо снова подготовить в папке source: браузер сохраняет только названия и тайминги.</p>
  <p>Для рендера помести видео в папку source рядом с JSON и выполни: npm run media:timeline -- persona-timeline.json export.mp4</p>
  {error&&<p role="alert">{error}</p>}
 </section>;
}
