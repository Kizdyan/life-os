import React,{useState} from 'react';
import {exportEmergencyRawData} from './data-portability';
import {
 exportPersonaCompleteBackup,inspectPersonaCompleteBackup,importPersonaCompleteBackup,
 type PersonaCompleteStats
} from './persona-complete-backup';

export default function DataPortability(){
  const [raw,setRaw]=useState('');
  const [preview,setPreview]=useState<PersonaCompleteStats|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [emergency,setEmergency]=useState(false);

  function saveFile(content:string,prefix:string){
    const file=new Blob([content],{type:'application/json'});
    const objectUrl=URL.createObjectURL(file);
    const link=document.createElement('a');
    link.href=objectUrl;
    link.download=prefix+'-'+new Date().toISOString().slice(0,10)+'.json';
    document.body.appendChild(link);
    link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(objectUrl),10000);
  }
  async function download(){
    if(busy)return;
    setBusy(true);setError('');setMessage('');setEmergency(false);
    try{
      const content=await exportPersonaCompleteBackup(localStorage);
      const stats=inspectPersonaCompleteBackup(content);
      saveFile(content,'life-os-persona-COMPLETE-backup');
      setMessage('Полная резервная копия создана: '+stats.editorialPosts+
       ' редакционных проектов, '+stats.stories+' Stories, '+stats.images+
       ' фотографий с исходными байтами. Сохрани файл в надёжном месте.');
    }catch(e){
      setEmergency(true);
      setError('Полная резервная копия НЕ создана: '+(e instanceof Error?e.message:'ошибка чтения')+
        '. Неполный архив не выдаётся за полный.');
    }finally{setBusy(false)}
  }
  function downloadEmergency(){
    setError('');setMessage('');
    try{
      saveFile(exportEmergencyRawData(localStorage),'life-os-raw-recovery');
      setMessage('Экстренная копия исходных данных сохранена как отдельный файл. Она не импортируется автоматически: требуется восстановление структуры. Ничего не удалено.');
    }catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить исходные данные.')}
  }
  async function choose(file?:File){
    setRaw('');setPreview(null);setMessage('');setError('');
    if(!file)return;
    try{
      if(file.size>380_000_000)throw Error('Архив превышает 380 МБ.');
      const content=await file.text();
      const stats=inspectPersonaCompleteBackup(content);
      setRaw(content);setPreview(stats);
    }catch(e){setError(e instanceof Error?e.message:'Не удалось прочитать файл.')}
  }
  async function restore(){
    if(!raw||!preview||busy)return;
    setBusy(true);setError('');
    try{
      const result=await importPersonaCompleteBackup(localStorage,raw);
      setMessage('Восстановлено: '+result.projects+' проектов, '+result.editorialPosts+
       ' каруселей/фото-постов, '+result.stories+' Stories и '+result.images+
       ' оригинальных фотографий. Существующие записи не перезаписаны.');
      setRaw('');setPreview(null);
    }catch(e){setError(e instanceof Error?e.message:'Не удалось восстановить данные.')}
    finally{setBusy(false)}
  }
  return <details className="dataPortability">
    <summary>Резервная копия и перенос данных</summary>
    <p>Полный архив содержит задачи, проекты, редакционные карусели, Stories и реальные фотографии из локального IndexedDB. Сохрани его перед очисткой Safari, сменой адреса или устройства. Никакой облачной синхронизации не происходит.</p>
    <div className="dataPortabilityActions">
      <button type="button" disabled={busy} onClick={()=>void download()}>{busy?'Подготовка…':'Сохранить ПОЛНЫЙ архив'}</button>
      <label>Выбрать архив
        <input type="file" disabled={busy} accept=".json,application/json" aria-label="Выбрать JSON-архив Life OS" onChange={e=>{void choose(e.target.files?.[0]);e.target.value=''}}/>
      </label>
    </div>
    {preview&&<div className="dataPortabilityActions">
      <p>В архиве: задач {preview.tasks}, идей {preview.ideas}, проектов {preview.projects}, каруселей/фото-постов {preview.editorialPosts}, Stories {preview.stories}, оригинальных фотографий {preview.images}. При импорте совпадающие записи не перезаписываются.</p>
      <button type="button" className="primary" disabled={busy} onClick={()=>void restore()}>{busy?'Восстановление…':'Восстановить без перезаписи'}</button>
    </div>}
    {emergency&&<div className="dataPortabilityActions">
      <button type="button" onClick={downloadEmergency}>Сохранить исходные повреждённые данные</button>
    </div>}
    {message&&<div role="status">{message} <button type="button" onClick={()=>location.reload()}>Обновить экран</button></div>}
    {error&&<p role="alert">{error}</p>}
    <p>Это НЕ зашифрованный файл: в нём содержатся исходные фотографии и приватные тексты. Храни его безопасно. Пароли и ключи не экспортируются. Старые резервные копии V1 тоже можно импортировать, но в них нет новых фотографий.</p>
  </details>;
}
