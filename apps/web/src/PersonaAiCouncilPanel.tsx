import React,{useEffect,useState} from 'react';
import type {AiCouncilResult} from '../../../api/_persona-ai-council';
import {validateScenarioResearch} from '../../../packages/core/src/persona-scenario-intelligence';
import {assertPersonaAsyncImportTarget,loadPersonaProjects,type PersonaProject,
 type PersonaScenarioWorkspace} from './personaProjectStore';
import {resolvePersonaScenarioDraftStorage,personaScenarioDraftExists} from './personaScenarioDraftJournal';

type Props={project:PersonaProject;workspace:PersonaScenarioWorkspace;
 creativeProfile:{priorities:string[];constraints:string[]};
 onChange:(next:PersonaScenarioWorkspace)=>void};
type Readiness={state:string;models?:Array<{id:string;provider:string;model:string;configured:boolean;skills:Record<string,number>}>};
const providerName=(x:string)=>x==='perplexity_agent'?'Perplexity Agent API':x==='ollama'?'Ollama (локально)':x;
export default function PersonaAiCouncilPanel({project,workspace,creativeProfile,onChange}:Props){
 const[ready,setReady]=useState<Readiness|null>(null);
 const[accessToken,setAccessToken]=useState('');
 const[consent,setConsent]=useState(false);
 const[busy,setBusy]=useState(false);
 const[notice,setNotice]=useState('');
 const report=workspace.aiCouncilReport;
 useEffect(()=>{
  let active=true;
  fetch('/api/persona-ai-council').then(r=>r.json()).then(x=>{
   if(active)setReady(x as Readiness);
  }).catch(()=>{if(active)setReady({state:'endpoint_unavailable'})});
  return ()=>{active=false};
 },[project.id]);
 const run=async()=>{
  if(busy||!consent||workspace.script)return;
  setBusy(true);setNotice('');
  try{
   const storage=resolvePersonaScenarioDraftStorage();
   if(personaScenarioDraftExists(storage,project.id))throw Error('Есть незавершённый черновик сценария.');
   const before=loadPersonaProjects(storage,()=> 'unused-council-id');
   const snapshot=before.projects.find(p=>p.id===project.id);
   if(!snapshot)throw Error('Проект не найден в локальном хранилище.');
   assertPersonaAsyncImportTarget(before,project.id,snapshot.revision);
   const current=snapshot.scenarioWorkspace??workspace;
   if(current.script)throw Error('В проекте есть сценарий. Он не может быть заменён исследованием.');
   // Learn from explicitly labeled author decisions across ALL saved Persona projects,
   // not only from the newly created empty project.
   const outcomes=before.projects.flatMap(p=>p.scenarioWorkspace?.aiCouncilOutcomes??[])
     .filter(x=>x.revisionId&&x.modelId).filter((x,i,all)=>
       all.findIndex(other=>other.revisionId===x.revisionId&&other.modelId===x.modelId&&
         other.task===x.task)===i).slice(-35);
   const history=before.projects.flatMap(p=>p.scenarioWorkspace?.ideas.map(i=>i.title)??[])
     .slice(-12);
   const response=await fetch('/api/persona-ai-council',{method:'POST',
    headers:{'Content-Type':'application/json',...(accessToken?{'x-persona-ai-access':accessToken}:{})},
    body:JSON.stringify({action:'run',confirmedSpend:true,
     creativeProfile:{priorities:creativeProfile.priorities,constraints:creativeProfile.constraints},
     history,
     feedback:before.projects.flatMap(p=>p.scenarioWorkspace?.editorialFeedback?.map(f=>f.comment)??[]).slice(-8),
     outcomes})});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(typeof data.error==='string'?data.error:'council_network_failure');
   const result=data as AiCouncilResult;
   if(result.version!==1||result.status!=='proposed_unapproved'||result.publicationApproved!==false||
    result.distributionAllowed!==false||!Array.isArray(result.ideas)||result.ideas.length!==3||
    !Array.isArray(result.sources)||!Array.isArray(result.steps))
    throw Error('Неполный ответ моделей. Сохранение запрещено.');
   const latest=loadPersonaProjects(storage,()=> 'unused-council-id');
   assertPersonaAsyncImportTarget(latest,project.id,snapshot.revision);
   if(personaScenarioDraftExists(storage,project.id))throw Error('Появились несохранённые правки сценария.');
   const base=latest.projects.find(p=>p.id===project.id)?.scenarioWorkspace??current;
   if(base.script)throw Error('Сценарий изменился во время исследования.');
   const byUrl=new Map(base.research.map(s=>[s.url,s.id]));
   const aliases=new Map(result.sources.map(s=>[s.id,byUrl.get(s.url)??s.id]));
   const sources=validateScenarioResearch([...base.research,
    ...result.sources.filter(source=>!byUrl.has(source.url))]);
   const ideas=result.ideas.map(idea=>({...idea,
    referenceIds:idea.referenceIds.map(id=>aliases.get(id)??id)}));
   const recommended=result.review?.recommendationIndex;
   const selected=typeof recommended==='number'&&recommended>=0&&recommended<3?recommended:0;
   onChange({...base,version:1,research:sources,ideas,
    selectedIdeaId:ideas[selected].id,aiCouncilReport:{...result,ideas}});
   setConsent(false);setNotice('Три идеи и история моделей сохранены. Сценарий и съёмка ещё не утверждены.');
  }catch(error){setNotice(error instanceof Error?error.message:'AI-совет недоступен');}
  finally{setBusy(false)}
 };
 return <section className="personaScenarioCard" aria-label="Совет нейросетей">
  <h4>Совет нейросетей · исследование и продюсирование</h4>
  <p>Модели распределяются по доступности, пригодности для задачи и реальным отзывам автора. Их результаты не являются доказательством популярности Reels.</p>
  <p><b>Статус:</b> {ready?.state??'Проверка конфигурации'}. Конфигурация ещё не подтверждает успешный вызов API.</p>
  {ready?.models?.length?<details><summary>Разрешённые модели и роли</summary><ul>
   {ready.models.map(m=><li key={m.id}>{providerName(m.provider)} · {m.model} · {m.configured?'доступ настроен':'нет доступа'}
    {' · '}{Object.entries(m.skills).filter(([,score])=>score>0).map(([name,score])=>name+':'+score).join(', ')}</li>)}
  </ul></details>:null}
  <p><small>Внешние API могут стоить денег. Серверный лимит останавливает следующие запросы, но не отменяет стоимость уже выполненных. Для строгого ограничения расходов нужен бюджет у провайдера.</small></p>
  <details><summary>Защищённый тестовый доступ</summary>
   <label>Токен сервера (не сохраняется)<input type="password" autoComplete="off"
    value={accessToken} onChange={e=>setAccessToken(e.target.value)} placeholder="Для локального запуска обычно не нужен"/></label>
  </details>
  <label className="personaScenarioWatch"><input type="checkbox" checked={consent}
   onChange={e=>setConsent(e.target.checked)}/>
   Разрешаю один запуск моделей с возможными расходами и передачей моего Creative Profile внешнему API.
  </label>
  <button type="button" className="primary" disabled={busy||!consent||Boolean(workspace.script)||
    ready?.state!=='configured_not_live_verified'} onClick={()=>{void run()}}>
   {busy?'Исследуем и проверяем идеи…':'Исследовать и создать 3 идеи через AI'}
  </button>
  {workspace.script&&<p><small>Этот проект уже содержит сценарий; автоматический совет не должен его перезаписывать.</small></p>}
  {notice&&<p role="status">{notice}</p>}
  {report&&<div className="personaScenarioReview">
   <h5>Последний AI-совет · ничего не утверждено</h5>
   <p>{report.researchSummary}</p>
   <p>Источники: {report.sources.length} · {report.researchStatus}. Реальные показатели Instagram не проверены.</p>
   <ol>{report.steps.map((step,i)=><li key={i}><b>{step.task}</b> · {providerName(step.provider)}
    {' / '}{step.model} · {step.status}. <small>{step.selectionBasis}
    {' '} {step.costUsd===null?'Стоимость не сообщена':'Стоимость API: $'+step.costUsd.toFixed(4)}</small>
   </li>)}</ol>
   <p><b>Выбор редактора:</b> {report.review.recommendationIndex===null?'Не определён':
    report.ideas[report.review.recommendationIndex]?.title??'Не определён'}.
    {' '}{report.review.rationale}</p>
   <p><small>{report.review.independentModel?'Разные модели для генерации и редактуры.':'Независимость моделей не подтверждена.'}
    {' '}Отчётная стоимость: {'$'}{report.totalReportedCostUsd.toFixed(4)}
    {report.costReportingComplete?'':' (отчёт неполный)'}</small></p>
   {report.review.concerns.length>0&&<ul>{report.review.concerns.map((x,i)=><li key={i}>{x}</li>)}</ul>}
  </div>}
 </section>;
}
