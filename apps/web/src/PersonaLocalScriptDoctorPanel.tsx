import React, {useEffect, useState} from "react";
import {
  type ScenarioCreativeProfile,
  type ScenarioScript,
} from "../../../packages/core/src/persona-scenario-intelligence";
import {
  applyPersonaLocalDoctorSuggestion,
  type PersonaLocalDoctorSuggestion,
} from "../../../packages/core/src/persona-local-script-doctor-handoff";
import {buildPersonaLocalDoctorTask} from "../../../packages/core/src/persona-local-script-doctor-workflow";
import "./persona-local-script-doctor.css";

type Props = {
  script: ScenarioScript;
  creativeProfile: ScenarioCreativeProfile;
  latestAuthorFeedback?: string;
  unsavedChanges: boolean;
  onAcceptRevision: (updated: ScenarioScript) => void;
  onRejectSuggestion: (reason: string, sourceRevisionId: string) => void;
};
type Preview = {
  sourceRevisionId: string;
  suggestion: PersonaLocalDoctorSuggestion;
};
const DEFAULT_INSTRUCTION = "Усиль причинность и финальный поворот. Сохрани живую речь и конкретные действия героя.";

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Не удалось проверить предложение редактора.";
}
function downloadJson(data: unknown, name: string): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type:"application/json"}));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Zero-credit browser handoff, not a network client.
 * The Windows CLI calls loopback Ollama, the browser never calls a paid or
 * remote model. Import validates the exact diff before author may apply it.
 */
export default function PersonaLocalScriptDoctorPanel({
  script, creativeProfile, latestAuthorFeedback, unsavedChanges, onAcceptRevision, onRejectSuggestion,
}:Props){
  const currentId = script.currentRevisionId;
  const count = script.currentRevision.beats.length;
  const [targetIndices,setTargetIndices] = useState<number[]>([count-1]);
  const [lockedIndices,setLockedIndices] = useState<number[]>([0]);
  const [instruction,setInstruction] = useState(DEFAULT_INSTRUCTION);
  const [feedback,setFeedback] = useState(latestAuthorFeedback??"");
  const [preview,setPreview] = useState<Preview|null>(null);
  const [message,setMessage] = useState("");
  const [rejectionReason,setRejectionReason] = useState("");
  const [error,setError] = useState("");

  useEffect(()=>{
    setTargetIndices([count-1]);
    setLockedIndices([0]);
    setPreview(null);
    setError("");
    setMessage("");
    setRejectionReason("");
  },[currentId,count]);
  useEffect(()=>{setFeedback(latestAuthorFeedback??"");},[latestAuthorFeedback]);

  const toggleTarget=(index:number)=>{
    setTargetIndices(current=>current.includes(index)?current.filter(i=>i!==index):[...current,index].sort((a,b)=>a-b));
    setLockedIndices(current=>current.filter(i=>i!==index));
    setPreview(null);
  };
  const toggleLocked=(index:number)=>{
    setLockedIndices(current=>current.includes(index)?current.filter(i=>i!==index):[...current,index].sort((a,b)=>a-b));
    setTargetIndices(current=>current.filter(i=>i!==index));
    setPreview(null);
  };
  const exportTask=()=>{
    try{
      if(unsavedChanges)throw new Error("Сначала сохраните редактируемую версию сценария.");
      const task=buildPersonaLocalDoctorTask(script,{
        targetIndices,lockedIndices,instruction,
        ...(feedback.trim()?{authorFeedback:feedback}:{}),
        creativeProfile,
      });
      downloadJson(task,"persona-doctor-task.json");
      setError("");
      setMessage("Задание скачано. Запустите его через локальный Ollama CLI на Windows, затем загрузите предложение сюда.");
    }catch(cause){setMessage("");setError(asMessage(cause))}
  };
  const importSuggestion=async(file:File|undefined)=>{
    if(!file)return;
    try{
      if(unsavedChanges)throw new Error("Сначала сохраните собственные изменения сценария.");
      if(file.size>100_000)throw new Error("Файл предложения превышает 100 КБ.");
      const parsed=JSON.parse(await file.text()) as unknown;
      // Verify against the still-current saved author revision before showing
      // any diff. The strict adapter rejects hidden edits and fake approval.
      applyPersonaLocalDoctorSuggestion(script,parsed,new Date().toISOString());
      const suggestion=parsed as PersonaLocalDoctorSuggestion;
      const changes=suggestion.diff.map(item=>item.beatIndex);
      if(changes.some(i=>!targetIndices.includes(i)||lockedIndices.includes(i))){
        throw new Error("Предложение затрагивает незапрошенную или закреплённую сцену.");
      }
      setPreview({sourceRevisionId:currentId,suggestion});
      setRejectionReason("");
      setMessage("Предложение проверено технически. Прочитайте каждое изменение: художественное качество ещё не подтверждено.");
      setError("");
    }catch(cause){setPreview(null);setMessage("");setError(asMessage(cause))}
  };
  const accept=()=>{
    try{
      if(unsavedChanges||!preview||preview.sourceRevisionId!==currentId){
        throw new Error("Редакция устарела. Сохраните исходный сценарий и повторно проверьте предложение.");
      }
      const next=applyPersonaLocalDoctorSuggestion(script,preview.suggestion,new Date().toISOString());
      // A conscious, explicit user click only. No auto-approval or production.
      onAcceptRevision(next);
      setPreview(null);
      setRejectionReason("");
      setMessage("Новая версия сохранена без авторского утверждения. Проверьте её перед съёмкой.");
      setError("");
    }catch(cause){setError(asMessage(cause))}
  };
  const reject=()=>{
    if(!preview||preview.sourceRevisionId!==currentId){
      setError("Предложение устарело.");return;
    }
    const note=rejectionReason.trim();
    if(note && note.length<12){
      setError("Для сохранения причины отклонения укажите не менее 12 символов.");return;
    }
    if(note)onRejectSuggestion(note,currentId);
    setPreview(null);
    setRejectionReason("");
    setError("");
    setMessage(note
      ?"Предложение отклонено. Причина сохранена в проекте для следующих редакторских проходов."
      :"Предложение отклонено без комментария. Авторский сценарий не изменён.");
  };
  const ready=Boolean(!unsavedChanges&&targetIndices.length&&instruction.trim().length>=3);

  return <details className="personaDoctorPanel">
    <summary>Локальный Script Doctor · драматургия и точечная редактура</summary>
    <p className="personaDoctorHint">Редактор делает два прохода: критика → переработка выбранных кадров. Всё выполняется локально на Windows. Здесь нет платного API, облачной генерации или автоматического утверждения.</p>
    {unsavedChanges&&<p role="status" className="personaDoctorWarning">Сначала сохраните текущие правки, чтобы не потерять авторскую версию.</p>}
    <fieldset disabled={unsavedChanges} className="personaDoctorSelections">
      <legend>Какие части разрешено исправлять?</legend>
      {script.currentRevision.beats.map((beat,index)=><div className="personaDoctorScene" key={index}>
        <div><strong>{index+1}. {beat.purpose==="hook"?"Хук":beat.purpose==="ending"?"Финал":"Развитие"}</strong><small>{beat.line}</small></div>
        <label><input type="checkbox" checked={targetIndices.includes(index)} onChange={()=>toggleTarget(index)}/> Исправить</label>
        <label><input type="checkbox" checked={lockedIndices.includes(index)} onChange={()=>toggleLocked(index)}/> Закрепить</label>
      </div>)}
    </fieldset>
    <label className="personaDoctorField">Что именно улучшить?
      <textarea aria-label="Инструкция для Script Doctor" rows={3} value={instruction}
        onChange={event=>{setInstruction(event.target.value);setPreview(null);}}/>
    </label>
    <label className="personaDoctorField">Предыдущая авторская критика
      <textarea aria-label="Критика для локального Script Doctor" rows={2} value={feedback}
        onChange={event=>{setFeedback(event.target.value);setPreview(null);}}
        placeholder="Что не устроило в предыдущей версии?"/>
    </label>
    <button type="button" className="ghost" disabled={!ready} onClick={exportTask}>
      Скачать локальное задание · 0 кредитов
    </button>
    <p className="personaDoctorHint">После загрузки задания на Windows, из папки Life OS выполните:</p>
    <code className="personaDoctorCommand">node tools/persona-local-script-doctor.mjs persona-doctor-task.json persona-doctor-suggestion.json --model qwen3:4b-instruct</code>
    <p className="personaDoctorHint">Перед запуском проверьте <code>ollama list</code> и при необходимости замените qwen3:4b-instruct на точное имя уже установленной локальной модели. Ничего не скачивается автоматически. iPhone и Vercel не обращаются к Windows напрямую.</p>
    <label className="personaDoctorField">Загрузить результат локального редактора
      <input aria-label="Импорт предложений Script Doctor" type="file" accept=".json,application/json"
        disabled={unsavedChanges} onChange={event=>{
          const file=event.target.files?.[0];
          event.target.value="";
          void importSuggestion(file);
        }}/>
    </label>
    {preview&&!unsavedChanges&&<section className="personaDoctorPreview" aria-label="Предложения локального Script Doctor">
      <h5>Редакторская критика (модель: {preview.suggestion.model})</h5>
      <p>{preview.suggestion.diagnosis.editorialSummary}</p>
      <ul>{preview.suggestion.diagnosis.findings.map((finding,index)=><li key={index}>
        <b>{finding.role} · кадр {finding.beatIndex+1}</b>: {finding.issue}
        <p>Основание: {finding.evidence}</p><p>Предложение: {finding.proposal}</p>
      </li>)}</ul>
      <h5>Изменения: {preview.suggestion.diff.length}</h5>
      {preview.suggestion.diff.map(item=><article className="personaDoctorDiff" key={item.beatIndex}>
        <h6>Кадр {item.beatIndex+1}</h6>
        <div><b>До</b><p>{item.before.line}</p><p>{item.before.action}</p><small>{item.before.durationSec} с</small></div>
        <div><b>После</b><p>{item.after.line}</p><p>{item.after.action}</p><small>{item.after.durationSec} с</small></div>
      </article>)}
      <p><b>Объяснение модели:</b> {preview.suggestion.changeSummary}</p>
      <p className="personaDoctorWarning">Это предложение ИИ. Принятие создаст новую неутверждённую версию и сбросит прежнее одобрение.</p>
      <label className="personaDoctorField">Почему предложение ИИ не подошло? (необязательно)
        <textarea aria-label="Причина отказа от предложения Script Doctor" rows={2}
          value={rejectionReason} onChange={event=>setRejectionReason(event.target.value)}
          placeholder="Например, финал стал предсказуемее, а герой потерял активное действие"/>
      </label>
      <div className="personaDoctorActions">
        <button type="button" className="primary" onClick={accept}>Принять как новую версию</button>
        <button type="button" className="ghost" onClick={reject}>Отклонить предложение</button>
      </div>
    </section>}
    {error&&<p role="alert" className="personaDoctorWarning">{error}</p>}
    {message&&<p role="status" className="personaDoctorHint">{message}</p>}
  </details>;
}
