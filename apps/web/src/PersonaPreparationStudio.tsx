import React,{useEffect,useMemo,useState} from 'react';

export type PreparationScene={line:string;action:string;durationSec:number};
export function normalizePreparationScenes(input:readonly PreparationScene[]|undefined):PreparationScene[]{
 if(!input||input.length<1||input.length>30)return [];
 const normalized=input.map(scene=>({
  line:typeof scene.line==='string'?scene.line.trim().slice(0,2000):'',
  action:typeof scene.action==='string'?scene.action.trim().slice(0,2000):'',
  durationSec:Number(scene.durationSec),
 }));
 if(normalized.some(scene=>!Number.isFinite(scene.durationSec)||scene.durationSec<0.25||scene.durationSec>60))return [];
 return normalized;
}

/** A browser storyboard only: never marks footage, rights, ASR or final media as approved. */
export default function PersonaPreparationStudio({scenes}:{
 scenes:readonly PreparationScene[]|undefined;
}){
 const beats=useMemo(()=>normalizePreparationScenes(scenes),[scenes]);
 const total=beats.reduce((sum,beat)=>sum+beat.durationSec,0);
 const [open,setOpen]=useState(false);
 const [playing,setPlaying]=useState(false);
 const [seconds,setSeconds]=useState(0);
 useEffect(()=>{setPlaying(false);setSeconds(0)},[scenes]);
 useEffect(()=>{
  if(!playing||!open||total<=0)return;
  const timer=window.setInterval(()=>{
   setSeconds(current=>{
    const next=Math.min(current+0.1,total);
    if(next>=total)setPlaying(false);
    return next;
   });
  },100);
  return ()=>window.clearInterval(timer);
 },[playing,open,total]);
 let running=0;
 const index=beats.findIndex(beat=>{
  const inside=seconds<running+beat.durationSec;running+=beat.durationSec;return inside;
 });
 const active=beats[Math.max(0,index>=0?index:beats.length-1)];
 return <section className="personaPreparationStudio" aria-label="Режим подготовки без съёмки">
  <div className="personaPreparationIntro">
   <div><small>PREPARATION MODE · БЕЗ СЪЁМОК</small>
    <h3>Режиссёрский аниматик</h3>
    <p>Посмотри ритм сценария в вертикальном кадре до того, как появятся настоящие дубли.</p>
   </div>
   <button type="button" className="personaPreparationToggle" aria-expanded={open} onClick={()=>{setOpen(v=>!v);setPlaying(false)}}>
    {open?'Свернуть':'Открыть аниматик'}
   </button>
  </div>
  {open&&(!active?<p role="status" className="personaPreparationEmpty">Сначала создай сценарий с длительностью сцен. Заглушки не заменяют отснятые кадры.</p>:
   <div className="personaPreparationBody">
    <div className={'personaPreparationFrame personaPreparationFrame--'+(Math.max(0,index)%3)} aria-label="Демонстрационная раскадровка">
     <div className="personaPreparationFrameTop"><span>PERSONA / STORYBOARD</span><span>{String(Math.max(0,index)+1).padStart(2,'0')} / {String(beats.length).padStart(2,'0')}</span></div>
     <div className="personaPreparationFrameMiddle"><small>ВИЗУАЛЬНАЯ ЗАГЛУШКА</small>
      <div className="personaPreparationFrameGlyph" aria-hidden="true">{String(Math.max(0,index)+1).padStart(2,'0')}</div>
      <strong>{active.action||'Действие не задано'}</strong>
     </div>
     <div className="personaPreparationFrameBottom">{active.line||'Сцена без реплики'}</div>
    </div>
    <div className="personaPreparationControls">
     <h4>Монтаж до съёмки</h4>
     <p>Примерный хронометраж: {total.toFixed(1)} с · {beats.length} сцен. Длительность реплик ещё не проверена вслух.</p>
     <div className="personaPreparationPlayback">
      <button type="button" onClick={()=>{if(seconds>=total)setSeconds(0);setPlaying(v=>!v)}}>{playing?'Пауза':'▶ Воспроизвести'}</button>
      <button type="button" onClick={()=>{setPlaying(false);setSeconds(0)}}>С начала</button>
     </div>
     <label className="personaPreparationSeek">Позиция: {seconds.toFixed(1)} / {total.toFixed(1)} сек
      <input type="range" min="0" max={total} step="0.1" value={seconds} onChange={event=>{setPlaying(false);setSeconds(Number(event.target.value))}}/>
     </label>
     <ol className="personaPreparationSceneList">{beats.map((beat,i)=><li key={i}>
      <button type="button" aria-current={i===Math.max(0,index)?'true':undefined} onClick={()=>{
       setPlaying(false);setSeconds(beats.slice(0,i).reduce((sum,x)=>sum+x.durationSec,0));
      }}><span>{String(i+1).padStart(2,'0')}</span><span>{beat.action||beat.line||'Сцена '+(i+1)}</span><small>{beat.durationSec.toFixed(1)} с</small></button>
     </li>)}</ol>
     <p className="personaPreparationDisclaimer">Это интерактивная раскадровка, а не MP4. Изображения, звук и актёрская игра не созданы; авторское утверждение и выпуск заблокированы до проверки реальных материалов.</p>
    </div>
   </div>
  )}
 </section>;
}
