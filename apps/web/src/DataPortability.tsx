import React,{useState} from 'react';
import {
 exportEmergencyRawData,inspectDeviceBackup,importDeviceData,type PortableStats
} from './data-portability';
import {
 exportFullPersonaBackup,inspectFullPersonaBackup,importFullPersonaBackup,
 type FullBackupStats
} from './personaFullBackup';

type Preview=PortableStats|FullBackupStats;
const isFull=(stats:Preview):stats is FullBackupStats=>'photos' in stats;
export default function DataPortability(){
 const [raw,setRaw]=useState('');
 const [zip,setZip]=useState<File|null>(null);
 const [preview,setPreview]=useState<Preview|null>(null);
 const [message,setMessage]=useState('');
 const [error,setError]=useState('');
 const [emergency,setEmergency]=useState(false);
 const [busy,setBusy]=useState(false);

 function saveBlob(blob:Blob,prefix:string,ext:'json'|'zip'){
  const objectUrl=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=objectUrl;
  link.download=prefix+'-'+new Date().toISOString().slice(0,10)+'.'+ext;
  document.body.appendChild(link);
  link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);
 }
 async function download(){
  setError('');setMessage('');setEmergency(false);setBusy(true);
  try{
   // This ZIP contains ALL editorial text, Stories and IndexedDB photo bytes.
   // A failed photo export must fail the WHOLE backup, never omit that photo.
   const file=await exportFullPersonaBackup(localStorage);
   saveBlob(file,'life-os-persona-full-backup','zip');
   setMessage('Полный ZIP подготовлен: задачи, проекты, редакционные карусели, Stories и оригиналы архивных фото. Сохрани файл вне браузера.');
  }catch(e){
   setEmergency(true);
   setError('Полная резервная копия не создана: '+(e instanceof Error?e.message:'ошибка экспорта')+
    '. Данные не удалены. Экстренная JSON-копия содержит только локальные тексты, не изображения.');
  }finally{setBusy(false)}
 }
 function downloadEmergency(){
  setError('');setMessage('');
  try{
   const raw=exportEmergencyRawData(localStorage);
   saveBlob(new Blob([raw],{type:'application/json'}),'life-os-raw-recovery','json');
   setMessage('Экстренная копия локального JSON сохранена. Это НЕ полный ZIP: фотографии сюда не входят.');
  }catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить исходные данные.')}
 }
 async function choose(file?:File){
  setRaw('');setZip(null);setPreview(null);setMessage('');setError('');
  if(!file)return;
  setBusy(true);
  try{
   if(file.name.toLowerCase().endsWith('.zip')){
    const stats=await inspectFullPersonaBackup(file);
    setZip(file);setPreview(stats);
   }else{
    if(file.size>2_000_000)throw Error('Устаревший JSON-архив слишком большой.');
    const content=await file.text(),stats=inspectDeviceBackup(content);
    setRaw(content);setPreview(stats);
    setMessage('Выбран старый JSON. Он не содержит редакционных изображений и Stories.');
   }
  }catch(e){setError(e instanceof Error?e.message:'Не удалось прочитать файл.')}
  finally{setBusy(false)}
 }
 async function restore(){
  if((!raw&&!zip)||!preview||busy)return;
  setError('');setBusy(true);
  try{
   if(zip){
    const result=await importFullPersonaBackup(localStorage,zip);
    setMessage('ZIP восстановлен без перезаписи существующих записей: задач '+result.tasks+
     ', проектов '+result.projects+', редакционных материалов '+result.editorial+
     ', Stories '+result.stories+', фотографий '+result.photos+'. Обнови страницу.');
   }else{
    const result=importDeviceData(localStorage,raw);
    setMessage('Старый JSON импортирован: задач '+result.tasks+
     ', решений '+result.ideas+', проектов '+result.projects+
     '. Карусели и фотографии в этом формате отсутствуют.');
   }
   setRaw('');setZip(null);setPreview(null);
  }catch(e){setError(e instanceof Error?e.message:'Не удалось восстановить данные.');}
  finally{setBusy(false)}
 }
 return <section className="dataPortability" aria-label="Резервная копия Persona">
  <h3>Резервная копия и перенос данных</h3>
  <p>Сохраняй <strong>полный браузерный ZIP</strong> перед очисткой Safari, переносом на другое устройство или сменой домена. Он включает редакционные тексты, Stories и оригинальные фотографии IndexedDB; API-ключи и пароли не входят.</p>
  <p role="note"><strong>Видеоархив Media Worker не входит в этот ZIP.</strong> Исходные MOV/MP4, готовые Reels и монтажные планы на Windows сохраняются отдельно. Для проверяемой копии каждого завершённого проекта на другом диске используй <a href="https://github.com/Kizdyan/life-os/blob/main/docs/persona-worker-job-backup.md" target="_blank" rel="noreferrer">инструкцию по локальному архиву Media Worker</a>. Перенос в другой каталог пока не гарантирует повторный рендер.</p>
  <div className="dataPortabilityActions">
   <button type="button" disabled={busy} onClick={()=>void download()}>
    {busy?'Проверка архива…':'Сохранить полный архив ZIP'}
   </button>
   <label>Выбрать ZIP или старый JSON
    <input type="file" accept=".zip,.json,application/zip,application/json"
     disabled={busy} aria-label="Выбрать резервный архив Persona" onChange={e=>{
      void choose(e.target.files?.[0]);e.target.value='';
     }}/>
   </label>
  </div>
  {preview&&<div className="dataPortabilityActions" role="status">
   <p>В архиве: задачи — {preview.tasks}, решения — {preview.ideas}, проекты — {preview.projects}
    {isFull(preview)&&<>; редакционные материалы — {preview.editorial}; Stories — {preview.stories}; фотографии — {preview.photos}</>}.
    Совпадающие проекты и фотографии НЕ перезаписываются.</p>
   <button type="button" className="primary" disabled={busy} onClick={()=>void restore()}>
    {busy?'Проверка и восстановление…':'Восстановить из архива'}
   </button>
  </div>}
  {emergency&&<button type="button" disabled={busy} onClick={downloadEmergency}>
   Сохранить экстренный JSON (без фотографий)
  </button>}
  {message&&<p role="status">{message} <button type="button" onClick={()=>location.reload()}>Обновить экран</button></p>}
  {error&&<p role="alert">{error}</p>}
  <p>ZIP хранится у тебя и содержит личные медиафайлы. При конфликте разных фотографий с одинаковым ID импорт остановится без замены твоей версии. Максимальный размер — 512 МиБ; при превышении архив не создаётся частично.</p>
 </section>;
}
