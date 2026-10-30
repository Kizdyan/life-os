import React, { useEffect, useState } from 'react';
import type { PersonaProductionBrief } from '../../../packages/core/src/persona-production-brief';
import {
 analyseScenarioReference,
 addFreeTrendLeadToScenarioResearch,
 approveScenarioScript,
 createScenarioScript,
 freeScenarioTrendLeads,
 reviewScenarioScript,
 reviseScenarioScript,
 scenarioScriptToFormatMemoryObservation,
 scenarioScriptToProductionBrief,
 suggestScenarioIdeas,
 validateScenarioResearch,
 type ScenarioIdea,
 type ScenarioObservationStatus,
 type ScenarioPlatform,
 type ScenarioScriptBeat,
} from '../../../packages/core/src/persona-scenario-intelligence';
import type { PersonaProject, PersonaScenarioWorkspace as Workspace } from './personaProjectStore';

type Props={
 project:PersonaProject;
 workspace:Workspace|undefined;
 creativeProfile:{priorities:string[];constraints:string[]};
 onChange:(workspace:Workspace)=>void;
 onCreateBrief:(brief:PersonaProductionBrief)=>void;
};

const emptyWorkspace=():Workspace=>({version:1,research:[],analyses:[],ideas:[]});
const platformLabels:Record<ScenarioPlatform,string>={instagram:'Instagram',youtube:'YouTube',vk:'VK',other:'другой источник'};

function sourceLabel(status:ScenarioObservationStatus){
 return status==='user_reviewed'?'Просмотрено автором':status==='unavailable'?'Источник недоступен':'Метаданные ссылки — видео не просмотрено';
}

function draftBeats(idea:ScenarioIdea):ScenarioScriptBeat[]{
 return [
  {purpose:'hook',line:`${idea.title}: одна ситуация, которую нельзя решить красивой позой.`,action:'Крупный план, начать действие в первом кадре.',durationSec:5},
  {purpose:'development',line:idea.originalConflict,action:'Перейти к предмету или действию, которое показывает препятствие.',durationSec:8},
  {purpose:'ending',line:idea.ending,action:'Вернуться к реакции и оставить завершённую паузу.',durationSec:6},
 ];
}

export default function PersonaScenarioWorkspace({project,workspace:received,creativeProfile,onChange,onCreateBrief}:Props){
 const workspace=received??emptyWorkspace();
 const[selectedIdeaId,setSelectedIdeaId]=useState(workspace.selectedIdeaId??'');
 const[link,setLink]=useState('');const[title,setTitle]=useState('');const[platform,setPlatform]=useState<ScenarioPlatform>('youtube');
 const[analysisNote,setAnalysisNote]=useState('');
 const[analysisDetails,setAnalysisDetails]=useState({situation:'',desire:'',obstacle:'',turn:'',payoff:'',editing:'',sound:''});
 const[selectedResearchId,setSelectedResearchId]=useState(workspace.research[0]?.id??'');
 const[watchedByAuthor,setWatchedByAuthor]=useState(false);
 const[author,setAuthor]=useState('');const[comment,setComment]=useState('');const[error,setError]=useState('');
 const script=workspace.script;
 const[beats,setBeats]=useState<ScenarioScriptBeat[]>(()=>script?.currentRevision.beats??[]);
 useEffect(()=>{setSelectedIdeaId(workspace.selectedIdeaId??'');setBeats(workspace.script?.currentRevision.beats??[])},[workspace.selectedIdeaId,workspace.script?.currentRevisionId]);
 const selected=workspace.ideas.find(idea=>idea.id===selectedIdeaId)??null;
 const review=script?reviewScenarioScript(script.currentRevision):null;
 const hasUnsavedChanges=Boolean(script&&JSON.stringify(beats)!==JSON.stringify(script.currentRevision.beats));
 const isApproved=Boolean(script?.approval&&script.approval.revisionId===script.currentRevision.id&&!hasUnsavedChanges);
 const update=(change:Partial<Workspace>)=>onChange({...workspace,...change,version:1});
 const addReference=()=>{
  try{
   const next=validateScenarioResearch([...workspace.research,{id:`reference-${Date.now()}`,url:link,platform,observedAt:new Date().toISOString(),observationStatus:'metadata_only',title:title.trim()||undefined,evidence:{kind:'manual_link',observedFields:title.trim()?['url','title']:['url']}}]);
   update({research:next});setLink('');setTitle('');setError('');
  }catch(cause){setError(cause instanceof Error?cause.message:'Не удалось добавить ссылку.');}
 };
 const addTrendLead=(index:number)=>{
  try{update({research:addFreeTrendLeadToScenarioResearch(workspace.research,freeScenarioTrendLeads[index],new Date().toISOString())});setError('');}
  catch(cause){setError(cause instanceof Error?cause.message:'Не удалось добавить источник.');}
 };
 const buildIdeas=()=>{
  try{const ideas=suggestScenarioIdeas({research:workspace.research,analyses:workspace.analyses,creativeProfile,count:5});update({ideas,selectedIdeaId:ideas[0]?.id});setSelectedIdeaId(ideas[0]?.id??'');setError('');}
  catch(cause){setError(cause instanceof Error?cause.message:'Сначала добавьте проверяемую ссылку.');}
 };
 const selectIdea=(id:string)=>{setSelectedIdeaId(id);update({selectedIdeaId:id});};
 const startScript=()=>{
  if(!selected)return;
  const next=createScenarioScript(selected,{createdAt:new Date().toISOString(),beats:draftBeats(selected)});
  update({script:next,selectedIdeaId:selected.id});setBeats(next.currentRevision.beats);setError('');
 };
 const saveScript=()=>{
  if(!script)return;
  try{const next=reviseScenarioScript(script,{createdAt:new Date().toISOString(),beats,reason:'Автор отредактировал сценарий в Persona.'});update({script:next});setError('');}
  catch(cause){setError(cause instanceof Error?cause.message:'Правки не сохранены.');}
 };
 const approveScript=()=>{
  if(!script)return;
  if(hasUnsavedChanges){setError('Сначала сохраните изменённые реплики и действия новой версией. Старое утверждение нельзя переносить на правки.');return}
  try{const next=approveScenarioScript(script,{author,comment,approvedAt:new Date().toISOString()});const memory=scenarioScriptToFormatMemoryObservation(next);update({script:next,formatMemory:[...(workspace.formatMemory??[]).filter(item=>item.sourceAssetId!==memory.sourceAssetId),memory]});setError('');}
  catch(cause){setError(cause instanceof Error?cause.message:'Сценарий пока нельзя утвердить.');}
 };
 const createBrief=()=>{
  if(!script)return;
  if(hasUnsavedChanges){setError('В бриф нельзя переносить несохранённые правки: сначала сохраните новую версию и утвердите её.');return}
  try{onCreateBrief(scenarioScriptToProductionBrief(script,{id:project.id,title:project.title,angle:project.sourceIdea,format:project.contentType}));setError('');}
  catch(cause){setError(cause instanceof Error?cause.message:'Сначала утвердите текущую версию сценария.');}
 };
 const addAnalysis=()=>{
  const reference=workspace.research.find(ref=>ref.id===selectedResearchId)??workspace.research[0];
  if(!reference){setError('Добавьте ссылку и выберите референс.');return}
  const content=[analysisNote,...Object.values(analysisDetails)];
  if(content.some(value=>value.trim().length<10)){
   setError('Заполните все восемь наблюдений содержательно (не менее 10 символов каждое), без шаблонных заглушек.');
   return;
  }
  try{
   const reviewedAt=watchedByAuthor?new Date().toISOString():undefined;
   const updatedResearch=workspace.research.map(item=>item.id===reference.id
    ?{...item,observationStatus:watchedByAuthor?'user_reviewed' as const:'metadata_only' as const,
      reviewedAt:watchedByAuthor?reviewedAt:undefined}
    :item);
   const updated=updatedResearch.find(item=>item.id===reference.id)!;
   const next=analyseScenarioReference(updated,{
    observationStatus:updated.observationStatus,reviewedAt:updated.reviewedAt,
    hook:analysisNote.trim(),...analysisDetails,
    productionComplexity:'low'
   });
   update({research:updatedResearch,analyses:[...workspace.analyses.filter(x=>x.researchId!==reference.id),next]});
   setAnalysisNote('');setAnalysisDetails({situation:'',desire:'',obstacle:'',turn:'',payoff:'',editing:'',sound:''});setWatchedByAuthor(false);setError('');
  }catch(cause){setError(cause instanceof Error?cause.message:'Не удалось сохранить проверяемый разбор.')}
 };
 return <section className="personaScenario" aria-label="Сценарий и референсы">
  <header className="personaScenarioHead"><div><h3>Сценарий из референсов</h3><p>Проект «{project.title}». Сначала добавьте проверяемую ссылку, затем выберите оригинальную концепцию.</p></div><span className="personaScenarioProvider">Perplexity отключён · Ollama только через CLI на Windows</span></header>
  <section className="personaTrendLeads"><div><h4>Бесплатные сигналы формата</h4><p>Датированные публичные источники. Это не метрики Reels и не доказательство просмотра конкретного ролика.</p></div>{freeScenarioTrendLeads.map((lead,index)=><article key={lead.id}><div><b>{lead.title}</b><p>{lead.mechanism}</p><small>{lead.publishedAt} · {lead.sourceTitle} · {lead.dateKind==='observed'?'дата проверки':'дата публикации'}</small><p><a href={lead.sourceUrl} target="_blank" rel="noreferrer">Открыть источник</a></p><small>{lead.limitation}</small></div><button type="button" className="ghost" onClick={()=>addTrendLead(index)}>Добавить в проект</button></article>)}</section>
  <div className="personaScenarioGrid">
   <article className="personaScenarioCard"><h4>Референсы</h4><p>Ссылка сохраняется с её статусом. Метаданные не означают просмотр видео.</p><label>Ссылка<input aria-label="Ссылка на референс" value={link} onChange={event=>setLink(event.target.value)} placeholder="https://…" inputMode="url"/></label><label>Короткое название<input aria-label="Название референса" value={title} onChange={event=>setTitle(event.target.value)} placeholder="Что именно в формате важно"/></label><label>Платформа<select aria-label="Платформа референса" value={platform} onChange={event=>setPlatform(event.target.value as ScenarioPlatform)}>{Object.entries(platformLabels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><button type="button" className="primary" onClick={addReference}>Добавить ссылку</button>
    <ul className="personaScenarioList">{workspace.research.map(reference=><li key={reference.id}><a href={reference.url} target="_blank" rel="noreferrer">{reference.title||reference.url}</a><span className={`personaEvidence ${reference.observationStatus}`}>{sourceLabel(reference.observationStatus)}</span></li>)}</ul>
   </article>
   <article className="personaScenarioCard"><h4>Разбор формата</h4><p>Выберите конкретный источник и разберите реальные обстоятельства, действие и монтаж. Ссылка и метаданные не доказывают просмотр.</p>
     <label>Референс для разбора<select aria-label="Референс для разбора" value={selectedResearchId||workspace.research[0]?.id||''} onChange={event=>{setSelectedResearchId(event.target.value);setWatchedByAuthor(false)}}>
     {workspace.research.map(item=><option key={item.id} value={item.id}>{item.title||item.url}</option>)}</select></label>
     <label>Хук и начало<textarea aria-label="Что работает в референсе" value={analysisNote} onChange={event=>setAnalysisNote(event.target.value)} placeholder="Что показано или утверждается источником? Не додумывайте содержание."/></label>
     {([
      ['situation','Обстоятельства'],['desire','Цель персонажа'],['obstacle','Препятствие'],
      ['turn','Поворот'],['payoff','Финал'],['editing','Монтажный приём'],['sound','Звук и музыка']
     ] as const).map(([field,label])=><label key={field}>{label}<textarea aria-label={label} value={analysisDetails[field]} onChange={event=>setAnalysisDetails(current=>({...current,[field]:event.target.value}))} placeholder="Только то, что действительно наблюдали или прочитали."/></label>)}
     <label className="personaScenarioWatch"><input type="checkbox" checked={watchedByAuthor} onChange={event=>setWatchedByAuthor(event.target.checked)}/> Я лично просмотрел этот конкретный ролик и подтверждаю наблюдения</label>
     <button type="button" className="ghost" disabled={!workspace.research.length} onClick={addAnalysis}>Сохранить разбор и источник</button>
     <p className="personaScenarioHint">{workspace.analyses.length?`Сохранено разборов: ${workspace.analyses.length}.`:'Нет содержательного разбора. Без него Idea Engine выдаёт только явно обозначенные шаблонные варианты.'}</p>
   </article>
  </div>
  <section className="personaScenarioIdeas"><div><h4>Оригинальные идеи</h4><p>Локальные варианты опираются на выбранные ссылки и ограничения Creative Profile. Это не прогноз охватов и не копирование чужих сцен.</p></div><button type="button" className="ghost" disabled={!workspace.research.length} onClick={buildIdeas}>Собрать 5 идей</button></section>
  <div className="personaScenarioIdeaList">{workspace.ideas.map(idea=><button type="button" key={idea.id} className={selectedIdeaId===idea.id?'selected':''} onClick={()=>selectIdea(idea.id)}><b>{idea.title}</b><span>{idea.originalConflict}</span><small>{idea.origin==='reviewed_reference'?`Механика просмотренного референса: ${idea.referenceIds.join(', ')}`:'Шаблонный fallback · без подтверждённого источника'} · {idea.estimatedDurationSec} сек.</small><small>{idea.evidenceNote}</small></button>)}</div>
  {selected&&!script&&<div className="personaScenarioAction"><p>Выбрана идея: <b>{selected.title}</b></p><button type="button" className="primary" onClick={startScript}>Создать редактируемый сценарий</button><small>Создаётся локальный структурный черновик, не результат платного ИИ.</small></div>}
  {script&&<section className="personaScenarioScript"><div className="personaScenarioScriptHead"><div><h4>Сценарий · версия {script.currentRevision.number}</h4><p>{isApproved?'Версия 1 одобрена'.replace('1',String(script.currentRevision.number)):'Ещё не одобрен автором'}</p></div><span className={review?.status==='ready_for_author'?'scenarioReady':'scenarioBlocked'}>{review?.status==='ready_for_author'?'Структура проверена':'Нужны правки'}</span></div>
   {beats.map((beat,index)=><fieldset key={`${beat.purpose}-${index}`}><legend>{beat.purpose==='hook'?'Хук':beat.purpose==='development'?'Развитие':'Финал'}</legend><label>Реплика<textarea aria-label={`Реплика сценария ${index+1}`} value={beat.line} onChange={event=>setBeats(current=>current.map((item,itemIndex)=>itemIndex===index?{...item,line:event.target.value}:item))}/></label><label>Действие<textarea aria-label={`Действие сценария ${index+1}`} value={beat.action} onChange={event=>setBeats(current=>current.map((item,itemIndex)=>itemIndex===index?{...item,action:event.target.value}:item))}/></label><label>Длительность, сек.<input aria-label={`Длительность сценария ${index+1}`} type="number" min="0.1" step="0.1" value={beat.durationSec} onChange={event=>setBeats(current=>current.map((item,itemIndex)=>itemIndex===index?{...item,durationSec:Number(event.target.value)}:item))}/></label></fieldset>)}
   {hasUnsavedChanges&&<p role="status" className="personaScenarioError">Есть несохранённые правки. Предыдущее утверждение не распространяется на изменённый текст.</p>}<button type="button" className="ghost" onClick={saveScript}>Сохранить новую версию</button>
   {review&&<div className="personaScenarioReview"><h5>Script Doctor</h5><ul>{review.findings.map(finding=><li key={`${finding.role}-${finding.code}`} className={finding.severity}>{finding.role}: {finding.message}</li>)}</ul></div>}
   {!isApproved&&<div className="personaScenarioApproval"><h5>Авторское утверждение</h5><label>Автор<input aria-label="Автор сценария" value={author} onChange={event=>setAuthor(event.target.value)} placeholder="Ваше имя"/></label><label>Комментарий<textarea aria-label="Комментарий автора" value={comment} onChange={event=>setComment(event.target.value)} placeholder="Что вы подтверждаете для съёмки"/></label><button type="button" className="primary" disabled={hasUnsavedChanges||review?.status!=='ready_for_author'||!author.trim()||!comment.trim()} onClick={approveScript}>Утвердить сценарий</button></div>}
   {isApproved&&<><p className="personaScenarioHint">В памяти форматов сохранены только одобренные вами приёмы, без выдуманных охватов: {workspace.formatMemory?.length??0}.</p><button type="button" className="primary" onClick={createBrief}>Создать съёмочный бриф</button></>}
  </section>}
  {error&&<p className="personaScenarioError" role="alert">{error}</p>}
 </section>;
}
