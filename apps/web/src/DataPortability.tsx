import React,{useState} from 'react';
import {exportDeviceData,inspectDeviceBackup,importDeviceData,type PortableStats} from './data-portability';

export default function DataPortability(){
  const [raw,setRaw]=useState('');
  const [preview,setPreview]=useState<PortableStats|null>(null);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');

  function download(){
    setError('');setMessage('');
    try{
      const content=exportDeviceData(localStorage);
      const file=new Blob([content],{type:'application/json'});
      const objectUrl=URL.createObjectURL(file);
      const link=document.createElement('a');
      link.href=objectUrl;
      link.download='life-os-persona-backup-'+new Date().toISOString().slice(0,10)+'.json';
      document.body.appendChild(link);
      link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(objectUrl),10000);
      setMessage('Архив подготовлен. Сохрани файл на устройстве: он содержит названия задач и историю идей.');
    }catch(e){setError(e instanceof Error?e.message:'Не удалось выгрузить файл.')}
  }
  async function choose(file?:File){
    setRaw('');setPreview(null);setMessage('');setError('');
    if(!file)return;
    try{
      if(file.size>2_000_000)throw Error('Архив слишком большой.');
      const content=await file.text();
      const stats=inspectDeviceBackup(content);
      setRaw(content);setPreview(stats);
    }catch(e){setError(e instanceof Error?e.message:'Не удалось прочитать файл.')}
  }
  function restore(){
    if(!raw||!preview)return;
    setError('');
    try{
      const result=importDeviceData(localStorage,raw);
      setMessage('Добавлено задач: '+result.tasks+'; решений Persona: '+result.ideas+'. Существующие записи сохранены.');
      setRaw('');setPreview(null);
    }catch(e){setError(e instanceof Error?e.message:'Не удалось восстановить данные.')}
  }
  return <details className="dataPortability">
    <summary>Резервная копия и перенос данных</summary>
    <p>Тестовая версия: задачи и история решений Persona хранятся только в этом браузере и на этом адресе. При переходе на другой адрес их нужно переносить вручную. Облачной синхронизации нет.</p>
    <div className="dataPortabilityActions">
      <button type="button" onClick={download}>Сохранить архив</button>
      <label>Выбрать архив
        <input type="file" accept=".json,application/json" aria-label="Выбрать JSON-архив Life OS" onChange={e=>{void choose(e.target.files?.[0]);e.target.value=''}}/>
      </label>
    </div>
    {preview&&<div className="dataPortabilityActions">
      <p>В архиве задач: {preview.tasks}, решений Persona: {preview.ideas}. При импорте совпадающие записи не перезаписываются.</p>
      <button type="button" className="primary" onClick={restore}>Добавить данные из архива</button>
    </div>}
    {message&&<div role="status">{message} <button type="button" onClick={()=>location.reload()}>Обновить экран</button></div>}
    {error&&<p role="alert">{error}</p>}
    <p>Файл хранится у тебя. Он может содержать личные сведения — не отправляй его посторонним. Пароли и ключи не экспортируются.</p>
  </details>;
}
