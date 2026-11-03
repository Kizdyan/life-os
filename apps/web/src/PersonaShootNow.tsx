import React,{useEffect,useState} from 'react';
import {
 makeShootSheet,markShootTake,readShootProgress,shootPlanFingerprint,
 shootProgressKey,shootTimecode,type PersonaShootPlan,type PersonaShootProgress,
} from './personaShootNow';
import './persona-shoot-now.css';

export function PersonaShootNow({
 projectId,plan,onOpenScript,onSavePilot,
}:{
 projectId:string;
 plan:PersonaShootPlan;
 onOpenScript:()=>void;
 onSavePilot?:()=>void;
}){
 const [currentIndex,setCurrentIndex]=useState(0);
 const [saved,setSaved]=useState<PersonaShootProgress|null>(()=>{
  try{return readShootProgress(JSON.parse(localStorage.getItem(shootProgressKey(projectId))||'null'),plan)}
  catch{return null}
 });
 const [feedback,setFeedback]=useState('');
 const fingerprint=shootPlanFingerprint(plan);
 useEffect(()=>{
  setCurrentIndex(0);
  try{setSaved(readShootProgress(JSON.parse(localStorage.getItem(shootProgressKey(projectId))||'null'),plan))}
  catch{setSaved(null)}
 },[projectId,fingerprint]);
 const current=plan.scenes[currentIndex];
 const completed=new Set(saved?.completedIds??[]);
 const recordedCount=plan.scenes.filter(scene=>completed.has(scene.id)).length;
 const totalDuration=plan.scenes.reduce((sum,scene)=>sum+scene.seconds,0);
 function toggleRecorded(id:string,checked:boolean){
  try{
   const next=markShootTake(plan,saved,id,checked,new Date().toISOString());
   localStorage.setItem(shootProgressKey(projectId),JSON.stringify(next));
   setSaved(next);
   setFeedback(checked?'Дубль отмечен в локальном чек-листе. Это отметка автора, не проверка файла.':'Отметка снята.');
  }catch{
   setFeedback('Не удалось сохранить прогресс в этом браузере. Файлы и рабочий сценарий не затронуты.');
  }
 }
 function downloadSheet(){
  try{
   const data=new Blob([makeShootSheet(plan)],{type:'text/markdown;charset=utf-8'});
   const url=URL.createObjectURL(data);
   const a=document.createElement('a');
   a.href=url;
   a.download='PERSONA-SHOOT-'+projectId.slice(0,24)+'.md';
   document.body.appendChild(a);
   try{a.click()}finally{a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),3000)}
   setFeedback('Съёмочный лист подготовлен. Проверь загрузки браузера.');
  }catch(error){setFeedback('Не удалось создать съёмочный лист: '+String((error as Error).message||error))}
 }
 return <section className="personaShootNow" aria-label="Снять ролик сейчас">
  <header className="personaShootNowHead">
   <div>
    <small>PERSONA / СЪЁМКА СЕГОДНЯ</small>
    <h3>Вот что снимать прямо сейчас</h3>
    <p>{plan.title}</p>
   </div>
   <span className="personaShootNowTime">{totalDuration} сек. · {plan.scenes.length} кадров</span>
  </header>
  {!plan.scenes.length?<div className="personaShootNowEmpty">
   <p>У этого проекта пока нет реплик и кадров. Не будем выдавать общий шаблон за готовый съёмочный сценарий.</p>
   <button type="button" onClick={onOpenScript}>Составить сценарий и кадры</button>
  </div>:<>
   <p className="personaShootNowStatus">
    {plan.status==='approved'?'Сценарий и съёмочный бриф утверждены в проекте.':
     plan.status==='example'?'Это готовый пример на 7 сцен. Он ещё не сохранён как сценарий проекта.':
     'Рабочий сценарий сохранён, но ещё не утверждён для съёмки.'}
    {' '}Публикация не разрешена автоматически.
   </p>
   <div className="personaShootNowSetup">
    <strong>1. За 5 минут подготовь площадку</strong>
    <p><b>Где:</b> {plan.setup.location}</p>
    <p><b>Камера:</b> {plan.setup.camera}</p>
    <p><b>Свет:</b> {plan.setup.lighting}</p>
    <p><b>Звук:</b> {plan.setup.sound}</p>
    <details>
     <summary>Костюм, реквизит и расположение</summary>
     <p><b>В кадре:</b> {plan.setup.wardrobe}</p>
     <p><b>Расстановка:</b> {plan.setup.arrangement}</p>
    </details>
   </div>
   <div className="personaShootNowProgress">
    <strong>2. Снимай кадры по порядку</strong>
    <span>{recordedCount} из {plan.scenes.length} отмечено тобой</span>
   </div>
   <div className="personaShootNowSceneNav" role="group" aria-label="Перейти к кадру">
    {plan.scenes.map((scene,index)=><button type="button" key={scene.id+'-'+index}
     aria-pressed={index===currentIndex} className={index===currentIndex?'current':''}
     onClick={()=>setCurrentIndex(index)}>
     <span>{completed.has(scene.id)?'✓':index+1}</span>
     <small>{shootTimecode(plan,index)}</small>
    </button>)}
   </div>
   <article className="personaShootNowScene" aria-live="polite">
    <div className="personaShootNowSceneTop">
     <b>КАДР {currentIndex+1} / {plan.scenes.length} · {current.id}</b>
     <span>{current.seconds} секунд · {current.framing}</span>
    </div>
    <small>СКАЖИ В КАДРЕ</small>
    <blockquote>«{current.line}»</blockquote>
    <p><b>Что сделать:</b> {current.action}</p>
    <p><b>Как поставить камеру:</b> {current.camera}</p>
    <p><b>Свет:</b> {current.lighting}</p>
    <p><b>Как сыграть:</b> {current.performance}</p>
    <p><b>Что учесть для монтажа:</b> {current.edit}</p>
    {current.sourceFileName&&<p><b>Назови дубль:</b> <code>{current.sourceFileName}</code></p>}
    <label className="personaShootNowCheck">
     <input type="checkbox" checked={completed.has(current.id)}
      onChange={event=>toggleRecorded(current.id,event.currentTarget.checked)}/>
     Я записал хотя бы один дубль этого кадра
    </label>
   </article>
   <div className="personaShootNowActions">
    <button type="button" className="secondary" disabled={currentIndex===0}
     onClick={()=>setCurrentIndex(index=>Math.max(0,index-1))}>Предыдущий кадр</button>
    <button type="button" className="primary" disabled={currentIndex===plan.scenes.length-1}
     onClick={()=>setCurrentIndex(index=>Math.min(plan.scenes.length-1,index+1))}>
     Следующий кадр
    </button>
   </div>
   <div className="personaShootNowFinal">
    <strong>3. После записи</strong>
    <p>Запиши 10 секунд тишины комнаты, проверь голос и музыкальный акцент, отдельно сними реакции и руки на клавишах. Затем переходи к монтажу только после просмотра дублей.</p>
    <div className="personaShootNowActions">
     {onSavePilot&&plan.status==='example'&&<button type="button" className="primary" onClick={onSavePilot}>
      Сохранить эти 7 сцен в сценарии проекта
     </button>}
     <button type="button" className="secondary" onClick={downloadSheet}>Скачать весь съёмочный лист</button>
     <button type="button" className="secondary" onClick={onOpenScript}>Проверить / изменить сценарий</button>
    </div>
   </div>
  </>}
  {feedback&&<p className="personaShootNowFeedback" role="status">{feedback}</p>}
 </section>;
}
