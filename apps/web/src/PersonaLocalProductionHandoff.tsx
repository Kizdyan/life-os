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
 if(brief.sourceFormat!=='reel')return {allowed:false,reason:'Локальный AI-монтаж предназначен для Reels.',brief};
 if(brief.script.length<2||brief.script.length>30||brief.shots.length!==brief.script.length||
    brief.script.some((beat,index)=>beat.order!==index+1||!beat.line.trim()||!Number.isFinite(beat.durationSec)||beat.durationSec<=0)||
    brief.shots.some((shot,index)=>shot.order!==index+1))
  return {allowed:false,reason:'Нужен согласованный сценарий с 2–30 сценами и раскадровкой.',brief};
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
  <p>Без облачной загрузки оригиналов. Скачивается утверждённый автором Production Brief с настоящими репликами и кадрами. Его использует локальный Whisper + Ollama + FFmpeg.</p>
  <p role="status">{handoff.reason}</p>
  <button type="button" className="ghost" disabled={!handoff.allowed} onClick={downloadBrief}>Скачать JSON для локального монтажа</button>
  {message&&<p role="status">{message}</p>}
  <details>
   <summary>Как получить реальный MP4 из дублей на Windows (ИИ + FFmpeg)</summary>
   <p>Сохраните JSON и реальные дубли в папке. Для семисценного пилота используйте A01/B01/...; для новых сценариев — S01_take01.mp4, S02_take01.mp4 и далее. Из корня Life OS запустите:</p>
   <pre>{'npm run media:ai:reel -- --takes "<ПАПКА_ДУБЛЕЙ>" --brief "<БРИФ.json>" --out "<НОВАЯ_ПАПКА_РЕЗУЛЬТАТА>" --whisper-cli "<WHISPER_CLI.exe>" --whisper-model "<MULTILINGUAL_GGML.bin>" --ollama-model "qwen3:4b-instruct" --variation cinematic'}</pre>
   <p>Требуются установленные FFmpeg/FFprobe, Whisper.cpp с мультиязычной моделью и запущенная Ollama с указанной моделью. При успехе откройте ai-edited-reel.mp4, RESULT.json, ai-edited-qa.json, ai-color-options и draft-reel.mp4. ИИ выбирает только реальные подтверждённые фрагменты распознанной речи, затем FFmpeg делает MP4 и цветовые варианты. Если модель или ASR недоступны, получите ошибку или пакет восстановления вместо фиктивного видео. Цветовой вариант выбирается по сценарию, а не по несуществующему анализу лица.</p>
  </details>
  <p className="briefEditNotice">Это передача данных, а не запуск монтажа из браузера. Черновик, субтитры и технический QA не равны художественному утверждению или разрешению на публикацию.</p>
 </section>;
}
