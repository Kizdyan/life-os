import React, {useState} from 'react';
import type {PersonaProductionPipeline} from '../../../packages/core/src/persona-production-pipeline';
import type {PersonaProductionBrief} from '../../../packages/core/src/persona-production-brief';
import {productionInputDraftExists} from './personaProductionInputJournal';
import {resolvePersonaScenarioDraftStorage} from './personaScenarioDraftJournal';
import './persona-local-production-handoff.css';

/** A local handoff is a copy of the saved, shoot-approved brief; never an approval to publish. */
export function assessPersonaLocalHandoff(pipeline:PersonaProductionPipeline,hasUnsavedDraft:boolean):{allowed:boolean;reason:string;brief:PersonaProductionBrief|null}{
 const brief=pipeline.materials.productionBrief??null;
 if(hasUnsavedDraft)return {allowed:false,reason:'Сначала сохраните незавершённую правку брифа.',brief};
 if(!brief||!pipeline.materials.qa)return {allowed:false,reason:'Сначала создайте и проверьте съёмочный бриф.',brief};
 if(brief.sourceFormat!=='reel')return {allowed:false,reason:'Семисценный локальный маршрут предназначен для Reels.',brief};
 if(brief.script.length!==7||brief.shots.length!==7||
    brief.script.some((beat,index)=>beat.order!==index+1||!beat.line.trim()||!Number.isFinite(beat.durationSec)||beat.durationSec<=0)||
    brief.shots.some((shot,index)=>shot.order!==index+1))
  return {allowed:false,reason:'Для первого Reels нужен проверенный бриф ровно из семи сцен.',brief};
 if(pipeline.input.idea.title!==brief.sourceTitle||pipeline.input.idea.angle!==brief.sourceAngle||
    pipeline.input.idea.format!==brief.sourceFormat||pipeline.input.idea.id!==brief.ideaId)
  return {allowed:false,reason:'Идея изменилась после создания брифа. Пересоберите и проверьте его.',brief};
 if(pipeline.materials.qa.status==='needs_revision')
  return {allowed:false,reason:'Структурная проверка выявила ошибки. Исправьте бриф.',brief};
 if(pipeline.stage!=='READY_FOR_SHOOT'||pipeline.materials.editorialDecision?.decision!=='approved')
  return {allowed:false,reason:'Сначала одобрите бриф для съёмки в редакторском блоке.',brief};
 return {allowed:true,reason:'Бриф готов для локального чернового монтажа.',brief};
}

export function PersonaLocalProductionHandoff({pipeline,projectId,hasUnsavedDraft}:{pipeline:PersonaProductionPipeline;projectId:string;hasUnsavedDraft:boolean}){
 const [message,setMessage]=useState('');
 const handoff=assessPersonaLocalHandoff(pipeline,hasUnsavedDraft);
 function downloadBrief(){
  const current=assessPersonaLocalHandoff(pipeline,hasUnsavedDraft||
   productionInputDraftExists(resolvePersonaScenarioDraftStorage(),projectId));
  if(!current.allowed||!current.brief){setMessage(current.reason);return}
  try{
   const name='persona-reel-brief-'+(projectId.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,40)||'project')+'.json';
   const blob=new Blob([JSON.stringify(current.brief,null,2)+'\n'],{type:'application/json'});
   const url=URL.createObjectURL(blob);
   const link=document.createElement('a');
   link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),60000);
   setMessage('Съёмочный бриф скачан. Выберите папку реальных дублей и запустите локальный runner; видео не создавалось.');
  }catch(error){setMessage('Не удалось скачать бриф: '+String((error as Error).message||error))}
 }
 return <section className="personaLocalHandoff" aria-label="Передача в локальный монтаж">
  <h4>Передать Reels в локальный монтаж</h4>
  <p>Без облачной загрузки оригиналов. Скачивается ровно сохранённый семисценный бриф, который понимает существующий Media Engine.</p>
  <p role="status">{handoff.reason}</p>
  <button type="button" className="ghost" disabled={!handoff.allowed} onClick={downloadBrief}>Скачать JSON для локального монтажа</button>
  {message&&<p role="status">{message}</p>}
  <details>
   <summary>Как собрать первый черновик на Windows</summary>
   <p>Сохраните JSON на компьютере. Поместите отснятые дубли в отдельную папку с именами сцен A01, B01, A02, B02, A03, B03, A04. Из корня Life OS запустите:</p>
   <pre>{'npm run media:first-reel:draft -- "<ПАПКА_ДУБЛЕЙ>" "<СКАЧАННЫЙ_БРИФ.json>" "<НОВАЯ_ПАПКА_РЕЗУЛЬТАТА>" "<WHISPER_CLI.exe>" "<МУЛЬТИЯЗЫЧНАЯ_МОДЕЛЬ.bin>"'}</pre>
   <p>Потребуются локальные FFmpeg, FFprobe и Whisper. При успешном запуске смотрите draft-reel.mp4, qa.json и RESULT.json. Если речь не распознана, runner создаст пакет ручной проверки вместо выдуманного результата.</p>
  </details>
  <p className="briefEditNotice">Это передача данных, а не запуск монтажа из браузера. Черновик, субтитры и технический QA не равны художественному утверждению или разрешению на публикацию.</p>
 </section>;
}
