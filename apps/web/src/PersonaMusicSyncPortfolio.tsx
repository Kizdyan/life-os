import React,{useEffect,useState} from 'react';
import {deleteMusicSyncTrack,listMusicSyncTracks,makeMusicSyncPack,saveMusicSyncTrack,type MusicRightsStatus,type MusicSyncTrack} from './personaMusicSyncDb';
import {visualIdentityConfig} from '../../../packages/core/src/persona-arsenal.mjs';
import './persona-industry-portfolio.css';

const identity=visualIdentityConfig();
const dur=(sec:number)=>String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');
const rightsLabels:Record<MusicRightsStatus,string>={owned:'Автор заявляет владение правами',licensed:'Автор заявляет наличие лицензии',unverified:'Права не подтверждены'};
export default function PersonaMusicSyncPortfolio({onBack}:{onBack:()=>void}){
 const [tracks,setTracks]=useState<MusicSyncTrack[]>([]);
 const [title,setTitle]=useState('');
 const [genre,setGenre]=useState('');
 const [mood,setMood]=useState('');
 const [minutes,setMinutes]=useState('1');
 const [seconds,setSeconds]=useState('0');
 const [stems,setStems]=useState(false);
 const [rightsOwner,setRightsOwner]=useState('');
 const [rightsStatus,setRightsStatus]=useState<MusicRightsStatus>('unverified');
 const [trackUrl,setTrackUrl]=useState('');
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [loaded,setLoaded]=useState(false);
 useEffect(()=>{
  let alive=true;
  listMusicSyncTracks().then(result=>{if(alive){setTracks(result);setLoaded(true)}})
   .catch(e=>{if(alive){setError((e as Error).message);setLoaded(true)}});
  return()=>{alive=false};
 },[]);
 async function add(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;
  setBusy(true);setError('');
  try{
   const total=Number(minutes)*60+Number(seconds);
   if(!Number.isSafeInteger(total)||total<1||total>14400)throw Error('Длительность: от 1 секунды до 240 минут');
   const now=new Date().toISOString();
   const track:MusicSyncTrack={version:1,id:'track-'+crypto.randomUUID(),title,genre,mood,
    durationSec:total,stems,rightsOwner,rightsStatus,trackUrl,createdAt:now,updatedAt:now};
   await saveMusicSyncTrack(track);
   setTracks(await listMusicSyncTracks());setTitle('');setMood('');setTrackUrl('');
  }catch(e){setError((e as Error).message)}
  finally{setBusy(false)}
 }
 async function remove(id:string){
  if(busy)return;
  setBusy(true);
  try{await deleteMusicSyncTrack(id);setTracks(await listMusicSyncTracks());setError('')}
  catch(e){setError((e as Error).message)}
  finally{setBusy(false)}
 }
 function downloadJson(){
  const blob=new Blob([JSON.stringify(makeMusicSyncPack(tracks),null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='persona-music-sync-metadata.json';
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 return <section className="personaIndustry personaMusicSync" style={{'--industry-ink':identity.colors.ink,'--industry-paper':identity.colors.paper,'--industry-warm':identity.colors.warm} as React.CSSProperties}>
  <header className="personaIndustryHeader">
   <button type="button" onClick={onBack}>← Мастерская</button>
   <small>PERSONA / MUSIC SYNC</small>
   <h2>Музыка для лицензирования</h2>
   <p>Локальный каталог композиторских треков с метаданными, правами и ссылками для режиссёров, продюсеров и музыкальных супервайзеров.</p>
  </header>
  <form className="personaIndustryPanel" onSubmit={add}>
   <h3>Добавить трек</h3>
   <div className="personaIndustryForm personaMusicSyncForm">
    <label>Название <input aria-label="Название трека" value={title} onChange={e=>setTitle(e.target.value)} required maxLength={120}/></label>
    <label>Жанр <input aria-label="Жанр" value={genre} onChange={e=>setGenre(e.target.value)} required maxLength={90} placeholder="Кинодрама"/></label>
    <label>Настроение / Mood <input aria-label="Настроение" value={mood} onChange={e=>setMood(e.target.value)} required maxLength={90} placeholder="Тревожное, сдержанное"/></label>
    <div className="personaIndustryDuration">
     <label>Минуты <input aria-label="Минуты" type="number" min="0" max="240" step="1" value={minutes} onChange={e=>setMinutes(e.target.value)}/></label>
     <label>Секунды <input aria-label="Секунды" type="number" min="0" max="59" step="1" value={seconds} onChange={e=>setSeconds(e.target.value)}/></label>
    </div>
    <label>Владелец прав / Rights owner <input aria-label="Владелец прав" value={rightsOwner} onChange={e=>setRightsOwner(e.target.value)} required maxLength={180}/></label>
    <label>Статус прав
     <select aria-label="Статус прав" value={rightsStatus} onChange={e=>setRightsStatus(e.target.value as MusicRightsStatus)}>
      <option value="unverified">Права требуют проверки</option>
      <option value="owned">Автор заявляет, что владеет правами</option>
      <option value="licensed">Автор заявляет, что получил лицензию</option>
     </select>
    </label>
    <label>Ссылка на аудио (HTTPS) <input aria-label="Ссылка на трек" type="url" value={trackUrl} onChange={e=>setTrackUrl(e.target.value)} required maxLength={2048} placeholder="https://…"/></label>
    <label className="personaIndustryCheckbox"><input type="checkbox" checked={stems} onChange={e=>setStems(e.target.checked)}/> Есть стемы для передачи</label>
    <button type="submit" disabled={busy}>Сохранить трек в локальную базу</button>
   </div>
   <p className="personaIndustryNotice">Аудиофайлы никуда не загружаются. Сведения о правах вводит автор — система не подтверждает лицензию автоматически.</p>
  </form>
  {error&&<p role="alert" className="personaIndustryError">{error}</p>}
  <section className="personaIndustryPanel" aria-label="Локальный музыкальный каталог">
   <div className="personaIndustryToolbar">
    <div><h3>Каталог треков ({tracks.length})</h3><p>Это IndexedDB на текущем устройстве, не облачная база.</p></div>
    <div className="personaIndustryPills">
     <button type="button" disabled={!tracks.length} onClick={()=>window.print()}>PDF-пакет с треками и ссылками</button>
     <button type="button" disabled={!tracks.length} onClick={downloadJson}>Экспорт метаданных JSON</button>
    </div>
   </div>
   {!loaded?<p>Открываем локальный каталог…</p>:!tracks.length?<p>Добавьте первый трек, чтобы сформировать пакет.</p>:
    <div className="personaMusicTrackList">{tracks.map(track=><article key={track.id}>
     <div><strong>{track.title}</strong><small>{track.genre} · {track.mood} · {dur(track.durationSec)} · стемы: {track.stems?'есть':'нет'}</small>
      <small>{track.rightsOwner} · {rightsLabels[track.rightsStatus]}</small>
      <a href={track.trackUrl} target="_blank" rel="noopener noreferrer">Открыть ссылку на трек</a>
     </div><button type="button" disabled={busy} onClick={()=>void remove(track.id)}>Удалить</button>
    </article>)}</div>}
  </section>
  <section className="personaMusicPrint" aria-label="Печатный PDF-пакет">
   <h1>PERSONA / MUSIC FOR SYNC</h1>
   <p className="personaMusicPrintSub">Каталог авторской музыки · Информация для предварительного рассмотрения</p>
   {tracks.map((track,index)=><article key={track.id}>
    <h2>{String(index+1).padStart(2,'0')}. {track.title}</h2>
    <p><b>Жанр:</b> {track.genre} · <b>Настроение:</b> {track.mood} · <b>Длительность:</b> {dur(track.durationSec)} · <b>Стемы:</b> {track.stems?'есть':'не указаны'}</p>
    <p><b>Правообладатель (со слов автора):</b> {track.rightsOwner}. <b>Статус:</b> {rightsLabels[track.rightsStatus]}.</p>
    <p><a href={track.trackUrl}>{track.trackUrl}</a></p>
   </article>)}
   <footer>Ссылка и сведения о правах приведены по данным автора. Наличие трека в пакете не означает автоматического разрешения на синхронизацию или распространение.</footer>
  </section>
 </section>;
}
