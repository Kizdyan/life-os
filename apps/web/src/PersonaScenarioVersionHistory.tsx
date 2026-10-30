import React,{useEffect,useState} from "react";
import type {ScenarioScript} from "../../../packages/core/src/persona-scenario-intelligence";
import {
  comparePersonaScenarioRevisions,
  restorePersonaScenarioRevision,
} from "../../../packages/core/src/persona-scenario-version-history";

type Props={
  script:ScenarioScript;
  unsavedChanges:boolean;
  onRestore:(newScript:ScenarioScript)=>void;
};
export default function PersonaScenarioVersionHistory({script,unsavedChanges,onRestore}:Props){
  const choosePrevious=()=>script.revisions.slice().reverse().find(item=>item.id!==script.currentRevisionId)?.id??"";
  const [selectedId,setSelectedId]=useState(choosePrevious);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  useEffect(()=>{setSelectedId(choosePrevious());setError("");setMessage("");},[script.currentRevisionId]);
  if(script.revisions.length<2)return null;
  const selected=script.revisions.find(item=>item.id===selectedId);
  const differences=selected?comparePersonaScenarioRevisions(selected,script.currentRevision):[];
  const restore=()=>{
    try{
      if(unsavedChanges)throw Error("Сначала сохраните текущие правки сценария.");
      if(!selected)throw Error("Выберите сохранённую версию.");
      const next=restorePersonaScenarioRevision(script,selected.id,new Date().toISOString());
      onRestore(next);
      setError("");
      setMessage("Старый сценарий восстановлен в новую неутверждённую версию. Предыдущие версии сохранены.");
    }catch(cause){setError(cause instanceof Error?cause.message:"Не удалось восстановить версию.")}
  };
  return <details className="personaScenarioCard">
    <summary>История сценария · {script.revisions.length} версий</summary>
    <p>Сравниваем сохранённые реплики, действия и длительности по позиции кадра. Утверждение не переносится при восстановлении.</p>
    <label>Сравнить текущую версию с
      <select aria-label="Предыдущая версия сценария" value={selectedId}
        onChange={event=>{setSelectedId(event.target.value);setError("");}}>
        {script.revisions.filter(item=>item.id!==script.currentRevisionId)
          .map(item=><option key={item.id} value={item.id}>Версия {item.number} · {item.createdAt}</option>)}
      </select>
    </label>
    {selected&&<>
      <p><b>Основание изменения:</b> {selected.reason||"Первоначальный авторский черновик"}</p>
      <p><b>Отличий:</b> {differences.length}</p>
      {differences.length===0&&<p>Реплики, действия и длительности совпадают.</p>}
      {differences.map(item=><article key={item.index} className="personaDoctorDiff">
        <h6>Кадр {item.index+1} · {item.kind==="added"?"Добавлен":item.kind==="removed"?"Удалён":"Изменён"}</h6>
        {item.changedFields.length>0&&<small>Поля: {item.changedFields.join(", ")}</small>}
        {item.before&&<div><b>Раньше</b><p>{item.before.line}</p><p>{item.before.action}</p><small>{item.before.durationSec} с</small></div>}
        {item.after&&<div><b>Теперь</b><p>{item.after.line}</p><p>{item.after.action}</p><small>{item.after.durationSec} с</small></div>}
      </article>)}
      <button type="button" className="ghost" disabled={unsavedChanges}
        onClick={restore}>Восстановить эту версию как новый черновик</button>
      <small>Это создаст новую версию, а не удалит последнюю. Любое предыдущее авторское утверждение будет сброшено.</small>
    </>}
    {error&&<p role="alert" className="personaDoctorWarning">{error}</p>}
    {message&&<p role="status">{message}</p>}
  </details>;
}
