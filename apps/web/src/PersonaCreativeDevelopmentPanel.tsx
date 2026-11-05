import React,{useState} from "react";
import {createScenarioScript} from "../../../packages/core/src/persona-scenario-intelligence";
import type {PersonaScenarioWorkspace} from "./personaProjectStore";
import {
  personaCreativeLenses,personaFirstReelConcepts,
  type PersonaCreativeConcept,
} from "./personaCreativeDevelopment";

type Props={
  workspace:PersonaScenarioWorkspace;
  onChange:(next:PersonaScenarioWorkspace)=>void;
  onCreateRevision?:(concept:PersonaCreativeConcept)=>void;
  blocked?:boolean;
};

/**
 * A transparent editorial comparison of three distinct pre-production drafts.
 * No paid inference, fake expert agents, author approval, media intake or upload.
 */
export default function PersonaCreativeDevelopmentPanel({workspace,onChange,onCreateRevision,blocked=false}:Props){
  const[activeId,setActiveId]=useState(personaFirstReelConcepts[0].id);
  const[notice,setNotice]=useState("");
  const selected=personaFirstReelConcepts.find(item=>item.id===activeId)??personaFirstReelConcepts[0];
  const existing=workspace.ideas.some(item=>item.id===selected.id);
  const add=()=>{
    if(existing){setNotice("Эта концепция уже есть среди идей проекта. Исходный сценарий не изменён.");return;}
    const ideas=[...workspace.ideas,selected.idea];
    if(workspace.script){
      onChange({...workspace,ideas,version:1});
      setNotice("Концепция сохранена для сравнения. Существующий сценарий и его утверждение не изменены; для новой версии сперва сохраните отдельную редакцию по собственному решению.");
      return;
    }
    const script=createScenarioScript(selected.idea,{
      createdAt:new Date().toISOString(),beats:selected.beats,
      sourceFacts:["Авторская редакторская гипотеза, без исследования охватов и без готовых исходных видео."],
    });
    onChange({...workspace,ideas,selectedIdeaId:selected.idea.id,script,version:1});
    setNotice("Создана НЕУТВЕРЖДЁННАЯ редакция. Проверьте реплики и действия в редакторе сценария, затем отдельно оцените творческие риски.");
  };
  return <section className="personaScenarioCard" aria-label="Творческое сравнение первого ролика">
    <h4>Creative Development · три разные концепции</h4>
    <p>Это первоначальные редакторские предложения, а не пять независимых AI-экспертиз и не прогноз просмотров. Пока ни один вариант не утверждён для съёмки.</p>
    <div className="personaScenarioIdeaList">
      {personaFirstReelConcepts.map(item=><button type="button" key={item.id}
        aria-pressed={selected.id===item.id}
        className={selected.id===item.id?"selected":""}
        onClick={()=>{setActiveId(item.id);setNotice("");}}>
        <b>{item.title}</b>
        <span>{item.mechanism}</span>
        <small>Предварительно {item.idea.estimatedDurationSec} сек. · Для зрителя: {item.audiencePromise}</small>
      </button>)}
    </div>
    <article aria-label={"Разбор концепции "+selected.title}>
      <h5>{selected.title}</h5>
      <p><b>Герой хочет:</b> {selected.heroGoal}</p>
      <p><b>Мешает:</b> {selected.obstacle}</p>
      <p><b>Поворот:</b> {selected.turn}</p>
      <p><b>Финал:</b> {selected.ending}</p>
      <p><b>Доказательство двух профессий:</b> {selected.cinematicProof}</p>
      <p><b>Риск производства:</b> {selected.productionNeed}</p>
      <h5>Редакторская критика — пять профессиональных ракурсов</h5>
      {personaCreativeLenses.map(lens=><details key={lens.id}>
        <summary>{lens.label} · что проверить</summary>
        <p><b>Вопрос:</b> {lens.question}</p>
        <p><b>Риск:</b> {selected.criticism[lens.id].weakness}</p>
        <p><b>Доработка:</b> {selected.criticism[lens.id].revision}</p>
      </details>)}
      <h5>Черновая последовательность кадров</h5>
      <ol>{selected.beats.map((beat,index)=><li key={index}>
        <b>Кадр {index+1} · {beat.durationSec} сек.</b> {beat.line}
        <p>{beat.action}</p>
        <small>Предмонтаж: {beat.editIntent}</small>
      </li>)}</ol>
      <button type="button" className="ghost" onClick={add} disabled={existing||blocked}>
        {existing?"Концепция уже сохранена":workspace.script?
         "Сохранить альтернативу, не меняя сценарий":"Создать неутверждённую редакцию из концепции"}
      </button>
      {workspace.script&&onCreateRevision&&<button type="button" className="primary"
        disabled={blocked} onClick={()=>onCreateRevision(selected)}>
        Создать НОВУЮ неутверждённую редакцию из этой концепции
      </button>}
      {blocked&&<p role="status">Сначала сохраните или разрешите черновик сценария. Сохранённые версии не изменены.</p>}
      {notice&&<p className="personaScenarioHint" role="status">{notice}</p>}
      {workspace.script&&<p className="personaScenarioHint">Существующая редакция и авторское утверждение защищены: выбор карточки ничего не перезаписывает.</p>}
    </article>
  </section>;
}
