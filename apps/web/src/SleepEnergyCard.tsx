import { useEffect, useMemo, useRef, useState } from 'react';
import { newSleepEntry, readSleepEntry, sleepSummary, suggestedSleepWindows } from './sleepEnergy';
import { persistSleepMeasurement, syncSleepRuntime } from './sleepRuntime';

export default function SleepEnergyCard({ date }: { date: string }) {
 const existing=typeof localStorage==='undefined'?null:readSleepEntry(localStorage,date);
 const [hours,setHours]=useState(existing?String(existing.durationMinutes/60):'7');
 const [energy,setEnergy]=useState(existing?.energy??5);
 const [quality,setQuality]=useState(existing?.sleepQuality??5);
 const [wellbeing,setWellbeing]=useState(existing?.wellbeing??5);
 const [selected,setSelected]=useState(existing?`${existing.sleepStart}–${existing.wakeTime}`:'');
 const [saved,setSaved]=useState(Boolean(existing));
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const dirty=useRef(false);
 const minutes=Math.round(Number(hours.replace(',','.'))*60);
 const windows=useMemo(()=>suggestedSleepWindows(minutes),[minutes]);
 const chosen=windows.find(w=>w.label===selected);
 const summary=typeof localStorage==='undefined'?{count:0,averageHours:0,averageEnergy:0}:sleepSummary(localStorage);
 function hydrate(){
  if(typeof localStorage==='undefined'||dirty.current)return;
  const latest=readSleepEntry(localStorage,date);if(!latest)return;
  setHours(String(latest.durationMinutes/60));setEnergy(latest.energy);
  setQuality(latest.sleepQuality??5);setWellbeing(latest.wellbeing??5);
  setSelected(`${latest.sleepStart}–${latest.wakeTime}`);setSaved(true);
 }
 useEffect(()=>{
  const onSynced=()=>hydrate();
  window.addEventListener('lifeos-runtime-sync',onSynced);
  void syncSleepRuntime().then(hydrate).catch(()=>undefined);
  return ()=>window.removeEventListener('lifeos-runtime-sync',onSynced);
 },[date]);
 function modified(){dirty.current=true;setSaved(false);setError('');}
 async function persist(){
  if(saving)return;
  const numericHours=Number(hours.replace(',','.'));
  // Explicit selection is single-valued; show the default if no selection was made.
  const sleepWindow=chosen??windows[0];
  if(!sleepWindow){setError('Укажи длительность сна');return}
  setSaving(true);setError('');
  try{
   const latest=typeof localStorage==='undefined'?null:readSleepEntry(localStorage,date);
   const entry=newSleepEntry({date,hours:numericHours,window:sleepWindow,energy,sleepQuality:quality,wellbeing},new Date().toISOString(),latest?.id);
   await persistSleepMeasurement({...entry,version:latest?.version});
   setSelected(sleepWindow.label);dirty.current=false;setSaved(true);
   window.dispatchEvent(new Event('lifeos-life-sensor'));
  }catch(cause){setSaved(false);setError(cause instanceof Error?cause.message:String(cause))}
  finally{setSaving(false)}
 }
 const selectedLabel=chosen?.label||'Не выбран — при сохранении будет предложен первый интервал';
 return <section className='sensorCard' aria-label='Сон и состояние'>
  <div className='sensorHead'><div><small>LIFE TRACKER</small><h2>Сон и состояние</h2></div>
    {saved&&<span className='sensorSaved' role='status'>✓ Сохранено</span>}</div>
  <div className='sensorGrid'>
   <label>Сколько спал<input inputMode='decimal' value={hours} onChange={e=>{setHours(e.target.value);setSelected('');modified()}}/><span>часов</span></label>
   <label>Энергия<strong>{energy}/10</strong><input type='range' min='1' max='10' value={energy} onChange={e=>{setEnergy(Number(e.target.value));modified()}}/></label>
   <label>Качество сна<strong>{quality}/10</strong><input type='range' min='1' max='10' value={quality} onChange={e=>{setQuality(Number(e.target.value));modified()}}/></label>
   <label>Самочувствие<strong>{wellbeing}/10</strong><input type='range' min='1' max='10' value={wellbeing} onChange={e=>{setWellbeing(Number(e.target.value));modified()}}/></label>
  </div>
  <div className='sleepWindows' role='group' aria-label='Когда именно спал'>
   <small>Когда именно спал</small>
   <div>{windows.map(w=><button type='button' key={w.label}
    aria-pressed={selected===w.label} className={selected===w.label?'selected':''}
    onClick={()=>{setSelected(w.label);modified()}}>{w.label}</button>)}</div>
   <p className='sleepSelectionSummary' role='status' aria-live='polite'>Выбрано: <strong>{selectedLabel}</strong></p>
  </div>
  <button className='sensorSave' disabled={saving} onClick={()=>void persist()}>
   {saving?'Сохраняю…':'Сохранить сон и состояние'}
  </button>
  {saved&&<p className='sleepSavedConfirmation' role='status'>✓ Измерение сохранено: {selected} · энергия {energy}/10 · качество {quality}/10 · самочувствие {wellbeing}/10</p>}
  {error&&<small className='runtimeError' role='alert'>{error}</small>}
  {summary.count>=2&&<p className='sensorInsight'>За {summary.count} записей: в среднем {summary.averageHours} ч сна · энергия {summary.averageEnergy}/10.</p>}
 </section>;
}
