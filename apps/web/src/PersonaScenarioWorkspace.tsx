import React, { useEffect, useState } from 'react';
import PersonaLocalScriptDoctorPanel from './PersonaLocalScriptDoctorPanel';
import PersonaScenarioVersionHistory from './PersonaScenarioVersionHistory';
import { assertPersonaAuthorLockedLines } from './personaBriefScenarioBridge';
import {
 readPersonaScenarioDraft,matchingPersonaScenarioDraft,savePersonaScenarioDraft,clearPersonaScenarioDraft,
 personaScenarioDraftExists,personaDraftKey,resolvePersonaScenarioDraftStorage,
 type PersonaScenarioDraftJournal,
} from './personaScenarioDraftJournal';
import type { PersonaProductionBrief } from '../../../packages/core/src/persona-production-brief';
import { importPersonaProductionBrief } from '../../../packages/core/src/persona-production-pipeline';
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
 const draftStorage=resolvePersonaScenarioDraftStorage();
 const[selectedIdeaId,setSelectedIdeaId]=useState(workspace.selectedIdeaId??'');
 const[link,setLink]=useState('');const[title,setTitle]=useState('');const[platform,setPlatform]=useState<ScenarioPlatform>('youtube');
 const[analysisNote,setAnalysisNote]=useState('');
 const[analysisDetails,setAnalysisDetails]=useState({situation:'',desire:'',obstacle:'',turn:'',payoff:'',editing:'',sound:''});
 const[selectedResearchId,setSelectedResearchId]=useState(workspace.research[0]?.id??'');
 const[watchedByAuthor,setWatchedByAuthor]=useState(workspace.research[0]?.observationStatus==='user_reviewed');
 const[rejectionFeedback,setRejectionFeedback]=useState('');
 const[revisionReason,setRevisionReason]=useState(()=>
  matchingPersonaScenarioDraft(draftStorage,project.id,received?.script)?.reason??'');
 const[author,setAuthor]=useState('');const[comment,setComment]=useState('');const[error,setError]=useState('');
 const script=workspace.script;
 const[beats,setBeats]=useState<ScenarioScriptBeat[]>(()=>
  matchingPersonaScenarioDraft(draftStorage,project.id,script)?.beats??script?.currentRevision.beats??[]);
 const[editingRevisionId,setEditingRevisionId]=useState(script?.currentRevisionId??'');
 const[corruptDraft,setCorruptDraft]=useState(()=>
  personaScenarioDraftExists(draftStorage,project.id)&&!readPersonaScenarioDraft(draftStorage,project.id));
 const[corruptBackupExported,setCorruptBackupExported]=useState(false);
 const[staleDraft,setStaleDraft]=useState<PersonaScenarioDraftJournal|null>(()=>{
  const saved=readPersonaScenarioDraft(draftStorage,project.id);
  return saved&&(saved.sourceRevisionId!==script?.currentRevisionId||saved.ideaId!==script?.idea.id)?saved:null;
 });
 useEffect(()=>{
  const current=workspace.script;
  const saved=readPersonaScenarioDraft(draftStorage,project.id);
  const matches=Boolean(current&&saved?.ideaId===current.idea.id&&saved.sourceRevisionId===current.currentRevisionId);
  setSelectedIdeaId(workspace.selectedIdeaId??'');
  setBeats(matches?saved!.beats:current?.currentRevision.beats??[]);
  setRevisionReason(matches?saved!.reason:'');
  setEditingRevisionId(current?.currentRevisionId??'');
  setStaleDraft(saved&&!matches?saved:null);
  setCorruptDraft(personaScenarioDraftExists(draftStorage,project.id)&&!saved);
  setCorruptBackupExported(false);
 },[project.id,workspace.selectedIdeaId,workspace.script?.currentRevisionId]);
 useEffect(()=>{
  if(!script||editingRevisionId!==script.currentRevisionId)return;
  const stored=readPersonaScenarioDraft(draftStorage,project.id);
  // Never overwrite an older, unreconciled draft after an external revision import.
  if(stored&&(stored.sourceRevisionId!==script.currentRevisionId||stored.ideaId!==script.idea.id))return;
  const dirty=JSON.stringify(beats)!==JSON.stringify(script.currentRevision.beats)||Boolean(revisionReason.trim());
  try{
   if(dirty){
    savePersonaScenarioDraft(draftStorage,{
     version:1,projectId:project.id,ideaId:script.idea.id,
     sourceRevisionId:script.currentRevisionId,beats,reason:revisionReason,
     savedAt:new Date().toISOString(),
    });
   }else if(stored&&stored.sourceRevisionId===script.currentRevisionId){
    clearPersonaScenarioDraft(draftStorage,project.id);
   }
  }catch{
   setError('Не удалось сохранить страховочную копию черновика. Перед уходом сохраните версию сценария.');
  }
 },[project.id,script?.currentRevisionId,editingRevisionId,beats,revisionReason]);
 const selected=workspace.ideas.find(idea=>idea.id===selectedIdeaId)??null;
 const review=script?reviewScenarioScript(script.currentRevision):null;
 const hasUnsavedChanges=Boolean(script&&JSON.stringify(beats)!==JSON.stringify(script.currentRevision.beats));
 const lockedForScript=(workspace.authorLockedLines??[]).filter(lock=>lock.ideaId===script?.idea.id);
 const isApproved=Boolean(script?.approval&&script.approval.revisionId===script.currentRevision.id&&!hasUnsavedChanges);
 const effectiveProfile=workspace.creativeProfile??creativeProfile;
 const update=(change:Partial<Workspace>)=>onChange({...workspace,...change,version:1});
 const recoverStaleDraft=()=>{
  if(!script||!staleDraft)return;
  try{
   if(staleDraft.ideaId!==script.idea.id)
    throw new Error('Черновик относится к другой идее. Он не применён к текущему сценарию.');
   assertPersonaAuthorLockedLines(workspace,staleDraft.beats,script.idea.id);
   const restored=reviseScenarioScript(script,{
    beats:staleDraft.beats,createdAt:new Date().toISOString(),
    reason:staleDraft.reason.trim()||'Явное восстановление несохранённой редакции после импорта.',
   });
   update({script:restored}); // Throws if project storage rejects the new version.
   clearPersonaScenarioDraft(draftStorage,project.id);
   setStaleDraft(null);
   setError('');
  }catch(cause){setError(cause instanceof Error?cause.message:'Не удалось восстановить черновик.');}
 };
 const discardStaleDraft=()=>{
  try{clearPersonaScenarioDraft(draftStorage,project.id);setStaleDraft(null);setError('');}
  catch{setError('Не удалось сбросить страховочную копию.');}
 };
 const exportCorruptDraft=()=>{
  try{
   const raw=draftStorage.getItem(personaDraftKey(project.id));
   if(raw===null)throw new Error('Страховочная копия не найдена.');
   const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));
   const link=document.createElement('a');link.href=url;
   link.download='persona-unsaved-script-backup.json';
   document.body.appendChild(link);link.click();link.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),1000);
   setCorruptBackupExported(true);setError('');
  }catch{setError('Не удалось скачать резервную копию. Данные сохранены в браузере.');}
 };
 const discardCorruptDraft=()=>{
  if(!corruptBackupExported){setError('Сначала скачайте резервную копию.');return}
  try{
   clearPersonaScenarioDraft(draftStorage,project.id);
   setCorruptDraft(false);setCorruptBackupExported(false);setError('');
  }catch{setError('Не удалось удалить повреждённую копию после экспорта.');}
 };
 const toggleAuthorLockedLine=(index:number)=>{
  if(!script||hasUnsavedChanges||staleDraft||corruptDraft){setError('Сначала сохраните или разрешите несохранённый черновик.');return}
  const remaining=(workspace.authorLockedLines??[]).filter(lock=>!(lock.ideaId===script.idea.id&&lock.index===index));
  const alreadyLocked=lockedForScript.some(lock=>lock.index===index);
  const next=alreadyLocked?remaining:[...remaining,{
   ideaId:script.idea.id,index,line:script.currentRevision.beats[index].line
  }];
  update({authorLockedLines:next});
  setError('');
 };
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
  try{const ideas=suggestScenarioIdeas({research:workspace.research,analyses:workspace.analyses,creativeProfile:{...effectiveProfile,constraints:[...effectiveProfile.constraints,...(workspace.editorialFeedback??[]).slice(-3).map(item=>'Автор ранее отклонил сценарий: '+item.comment)]},count:5});update({ideas,selectedIdeaId:ideas[0]?.id});setSelectedIdeaId(ideas[0]?.id??'');setError('');}
  catch(cause){setError(cause instanceof Error?cause.message:'Сначала добавьте проверяемую ссылку.');}
 };
 const selectIdea=(id:string)=>{setSelectedIdeaId(id);update({selectedIdeaId:id});};
 const startScript=()=>{
  if(!selected)return;
  const next=createScenarioScript(selected,{createdAt:new Date().toISOString(),beats:draftBeats(selected)});
  update({script:next,selectedIdeaId:selected.id});setBeats(next.currentRevision.beats);setError('');
 };
 const addDevelopmentBeat=()=>{
  if(beats.length>=12){setError('Максимум 12 смысловых блоков. Уберите лишние или сократите сцену.');return}
  const point=Math.max(1,beats.findIndex(beat=>beat.purpose==='ending'));
  const next={purpose:'development' as const,line:'Опишите следующую реплику или немую сцену',action:'Укажите конкретное физическое действие героя',durationSec:4};
  setBeats(current=>[...current.slice(0,point),next,...current.slice(point)]);
  setError('');
 };
 const removeDevelopmentBeat=(index:number)=>{
  if(beats[index]?.purpose!=='development'||beats.filter(beat=>beat.purpose==='development').length<=1){
   setError('Хук, финал и хотя бы одно развитие должны оставаться в сценарии.');return
  }
  setBeats(current=>current.filter((_,i)=>i!==index));setError('');
 };
 const moveDevelopmentBeat=(index:number,direction:-1|1)=>{
  const other=index+direction;
  if(beats[index]?.purpose!=='development'||beats[other]?.purpose!=='development')return;
  setBeats(current=>{const next=[...current];[next[index],next[other]]=[next[other],next[index]];return next});
 };
 const saveScript=()=>{
  if(!script)return;
  try{
   if(staleDraft||corruptDraft)throw new Error('Сначала восстановите или разрешите сохранённый черновик.');
   assertPersonaAuthorLockedLines(workspace,beats,script.idea.id);
   const next=reviseScenarioScript(script,{createdAt:new Date().toISOString(),beats,reason:revisionReason.trim()||'Автор изменил содержание сценария в Persona.'});
   update({script:next}); // Sync project persistence happens before journal removal.
   clearPersonaScenarioDraft(draftStorage,project.id);
   setRevisionReason('');setError('');
  }
  catch(cause){setError(cause instanceof Error?cause.message:'Правки не сохранены.');}
 };
 const approveScript=()=>{
  if(!script)return;
  if(staleDraft||corruptDraft){setError('Сначала восстановите или разрешите сохранённый черновик.');return}
  if(hasUnsavedChanges){setError('Сначала сохраните изменённые реплики и действия новой версией. Старое утверждение нельзя переносить на правки.');return}
  try{const next=approveScenarioScript(script,{author,comment,approvedAt:new Date().toISOString()});const memory=scenarioScriptToFormatMemoryObservation(next);update({script:next,formatMemory:[...(workspace.formatMemory??[]).filter(item=>item.sourceAssetId!==memory.sourceAssetId),memory]});setError('');}
  catch(cause){setError(cause instanceof Error?cause.message:'Сценарий пока нельзя утвердить.');}
 };
 const rejectWithFeedback=()=>{
  if(!script||rejectionFeedback.trim().length<12){setError('Укажите конкретную причину отклонения (не менее 12 символов).');return}
  const current=script.currentRevision.id;
  const feedback={revisionId:current,comment:rejectionFeedback.trim(),createdAt:new Date().toISOString()};
  update({editorialFeedback:[...(workspace.editorialFeedback??[]),feedback]});
  setRejectionFeedback('');setError('Критика сохранена отдельно от одобрений; следующий набор идей получит эту причину как ограничение.');
 };
 const exportLocalAiTask=()=>{
  if(!script){setError('Сначала сохраните сценарий.');return}
  if(hasUnsavedChanges){setError('Сначала сохраните правки новой версией, чтобы локальная модель получила актуальный текст.');return}
  const current=script.currentRevision;
  const idea=script.idea;
  const first=current.beats[0],last=current.beats[current.beats.length-1];
  if(!first||!last){setError('В сценарии нет кадров для передачи локальному редактору.');return}
  const task={
   kind:'persona-scenario-local-input-v1',version:1,
   idea:{id:project.id,title:project.title,angle:project.sourceIdea,format:project.contentType},
   storyOutline:{
    premise:idea.originalConflict,hook:first.line,protagonistGoal:idea.actingTask,
    obstacle:idea.originalConflict,escalation:current.beats.slice(1,-1).map(beat=>beat.action).join(' ')||'Герой сталкивается с препятствием.',
    turn:idea.ending,payoff:last.line,actingAction:idea.actingTask,visualMoment:first.action
   },
   ...(workspace.editorialFeedback?.length?{previousEditorialFeedback:workspace.editorialFeedback[workspace.editorialFeedback.length-1].comment}:{}),
   ...(workspace.research.find(item=>item.id===idea.referenceIds[0])?.url
      ?{sourceReferenceUrl:workspace.research.find(item=>item.id===idea.referenceIds[0])!.url}:{})
  };
  const blob=new Blob([JSON.stringify(task,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='persona-scenario-input.json';document.body.appendChild(a);a.click();a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  setError('Задание скачано локально. Запустите Ollama CLI на Windows, затем импортируйте готовый бриф в этом же проекте. Облачных запросов не было.');
 };
 const importLocalAiRevision=async(file:File|undefined)=>{
  if(!file||!script)return;
  try{
   if(hasUnsavedChanges||staleDraft||corruptDraft)throw new Error('Сначала сохраните или разрешите несохранённый черновик. Импорт не должен стирать ручную работу.');
   if(file.size>200_000)throw new Error('Файл сценария слишком большой (максимум 200 КБ).');
   const decoded=JSON.parse(await file.text()) as unknown;
   const imported=importPersonaProductionBrief({
    brief:decoded,
    selectedIdea:{id:project.id,title:project.title,angle:project.sourceIdea,format:project.contentType}
   });
   const brief=imported.materials.productionBrief;
   if(!brief||brief.script.length<3||brief.script.length>12)throw new Error('Ожидается 3–12 сценарных частей.');
   const beats:ScenarioScriptBeat[]=brief.script.map((beat,index)=>({
    purpose:index===0?'hook':index===brief.script.length-1?'ending':'development',
    line:beat.line,action:beat.action,durationSec:beat.durationSec
   }));
   assertPersonaAuthorLockedLines(workspace,beats,script.idea.id);
   const candidate=reviseScenarioScript(script,{
    createdAt:new Date().toISOString(),beats,
    reason:'Импортирован локальный сценарный бриф. Происхождение редакции и её качество требуют проверки автора.'
   });
   update({script:candidate});setBeats(candidate.currentRevision.beats);setError('');
  }catch(cause){
   setError(cause instanceof Error?cause.message:'Файл локального сценария не импортирован.');
  }
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
  <details className="personaScenarioCard"><summary>Творческий профиль проекта · редактировать</summary>
    <p>Сохранённые требования этого проекта, а не выдуманная биография. Настрой свои приоритеты и ограничения для следующих идей.</p>
    <label>Творческие приоритеты<textarea aria-label="Приоритеты творческого профиля" value={effectiveProfile.priorities.join('\n')}
      onChange={event=>update({creativeProfile:{...effectiveProfile,priorities:event.target.value.split('\n').map(v=>v.trim()).filter(Boolean).slice(0,25)}})}/></label>
    <label>Ограничения съёмки и образа<textarea aria-label="Ограничения творческого профиля" value={effectiveProfile.constraints.join('\n')}
      onChange={event=>update({creativeProfile:{...effectiveProfile,constraints:event.target.value.split('\n').map(v=>v.trim()).filter(Boolean).slice(0,25)}})}/></label>
    <small>Редакторские предпочтения сохраняются в текущем проекте, без отправки в облачные AI.</small>
  </details>
  <div className="personaScenarioGrid">
   <article className="personaScenarioCard"><h4>Референсы</h4><p>Ссылка сохраняется с её статусом. Метаданные не означают просмотр видео.</p><label>Ссылка<input aria-label="Ссылка на референс" value={link} onChange={event=>setLink(event.target.value)} placeholder="https://…" inputMode="url"/></label><label>Короткое название<input aria-label="Название референса" value={title} onChange={event=>setTitle(event.target.value)} placeholder="Что именно в формате важно"/></label><label>Платформа<select aria-label="Платформа референса" value={platform} onChange={event=>setPlatform(event.target.value as ScenarioPlatform)}>{Object.entries(platformLabels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><button type="button" className="primary" onClick={addReference}>Добавить ссылку</button>
    <ul className="personaScenarioList">{workspace.research.map(reference=><li key={reference.id}><a href={reference.url} target="_blank" rel="noreferrer">{reference.title||reference.url}</a><span className={`personaEvidence ${reference.observationStatus}`}>{sourceLabel(reference.observationStatus)}</span></li>)}</ul>
   </article>
   <article className="personaScenarioCard"><h4>Разбор формата</h4><p>Выберите конкретный источник и разберите реальные обстоятельства, действие и монтаж. Ссылка и метаданные не доказывают просмотр.</p>
     <label>Референс для разбора<select aria-label="Референс для разбора" value={selectedResearchId||workspace.research[0]?.id||''} onChange={event=>{setSelectedResearchId(event.target.value);setAnalysisNote('');setAnalysisDetails({situation:'',desire:'',obstacle:'',turn:'',payoff:'',editing:'',sound:''});setWatchedByAuthor(workspace.research.find(ref=>ref.id===event.target.value)?.observationStatus==='user_reviewed')}}>
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
  <section className="personaScenarioIdeas"><div><h4>Оригинальные идеи</h4><p>Локальные варианты опираются на выбранные ссылки и ограничения Creative Profile. Это не прогноз охватов и не копирование чужих сцен.</p></div><button type="button" className="ghost" onClick={buildIdeas}>Собрать 5 идей</button></section>
  <div className="personaScenarioIdeaList">{workspace.ideas.map(idea=><button type="button" key={idea.id} className={selectedIdeaId===idea.id?'selected':''} onClick={()=>selectIdea(idea.id)}><b>{idea.title}</b><span>{idea.originalConflict}</span><small>{idea.origin==='reviewed_reference'?`Механика просмотренного референса: ${idea.referenceIds.join(', ')}`:'Шаблонный fallback · без подтверждённого источника'} · {idea.estimatedDurationSec} сек.</small><small>{idea.evidenceNote}</small></button>)}</div>
  {selected&&!script&&<div className="personaScenarioAction"><p>Выбрана идея: <b>{selected.title}</b></p><button type="button" className="primary" onClick={startScript}>Создать редактируемый сценарий</button><small>Создаётся локальный структурный черновик, не результат платного ИИ.</small></div>}
  {corruptDraft&&<div role="alert" className="personaScenarioWarning">
    <p>В браузере обнаружена повреждённая страховочная копия сценария. Она не удалена и не заменена новым текстом. Сначала сохраните её на компьютер, затем можно удалить запись из браузера и продолжить работу.</p>
    <button type="button" onClick={exportCorruptDraft}>Скачать исходные данные черновика</button>
    <button type="button" className="ghost" disabled={!corruptBackupExported} onClick={discardCorruptDraft}>Удалить повреждённую копию после скачивания</button>
   </div>}
  {script&&<section className="personaScenarioScript"><div className="personaScenarioScriptHead"><div><h4>Сценарий · версия {script.currentRevision.number}</h4><p>{isApproved?'Версия 1 одобрена'.replace('1',String(script.currentRevision.number)):'Ещё не одобрен автором'}</p></div><span className={review?.status==='ready_for_author'?'scenarioReady':'scenarioBlocked'}>{review?.status==='ready_for_author'?'Структура проверена':'Нужны правки'}</span></div>
   {staleDraft&&<div role="alert" className="personaScenarioWarning">
    <p>Найден несохранённый черновик от предыдущей редакции ({staleDraft.sourceRevisionId}). Его текст не потерян и не применён автоматически. Выберите действие:</p>
    <button type="button" onClick={recoverStaleDraft}>Восстановить как новую неутверждённую версию</button>
    <button type="button" className="ghost" onClick={discardStaleDraft}>Отбросить этот черновик</button>
   </div>}
   {beats.map((beat,index)=><fieldset key={`${beat.purpose}-${index}`} disabled={Boolean(staleDraft||corruptDraft)}><legend>{beat.purpose==='hook'?'Хук':beat.purpose==='development'?'Развитие':'Финал'}</legend><label>Реплика<textarea aria-label={`Реплика сценария ${index+1}`} readOnly={lockedForScript.some(lock=>lock.index===index)} value={beat.line} onChange={event=>setBeats(current=>current.map((item,itemIndex)=>itemIndex===index?{...item,line:event.target.value}:item))}/></label>
     <button type="button" className="ghost" disabled={hasUnsavedChanges}
      aria-label={`${lockedForScript.some(lock=>lock.index===index)?'Снять закрепление':'Закрепить'} реплику кадра ${index+1}`}
      onClick={()=>toggleAuthorLockedLine(index)}>
      {lockedForScript.some(lock=>lock.index===index)?'🔒 Закреплена автором · снять закрепление':'Закрепить реплику'}
     </button>
     <label>Действие<textarea aria-label={`Действие сценария ${index+1}`} value={beat.action} onChange={event=>setBeats(current=>current.map((item,itemIndex)=>itemIndex===index?{...item,action:event.target.value}:item))}/></label><label>Длительность, сек.<input aria-label={`Длительность сценария ${index+1}`} type="number" min="0.1" step="0.1" value={beat.durationSec} onChange={event=>setBeats(current=>current.map((item,itemIndex)=>itemIndex===index?{...item,durationSec:Number(event.target.value)}:item))}/></label>
     {beat.purpose==='development'&&<div className="personaScenarioBeatActions">
       <button type="button" className="ghost" disabled={beats[index-1]?.purpose!=='development'} onClick={()=>moveDevelopmentBeat(index,-1)}>Выше</button>
       <button type="button" className="ghost" disabled={beats[index+1]?.purpose!=='development'} onClick={()=>moveDevelopmentBeat(index,1)}>Ниже</button>
       <button type="button" className="ghost" disabled={beats.filter(b=>b.purpose==='development').length<=1} onClick={()=>removeDevelopmentBeat(index)}>Удалить блок</button>
     </div>}
    </fieldset>)}
    <button type="button" className="ghost" onClick={addDevelopmentBeat} disabled={Boolean(staleDraft||corruptDraft)||beats.length>=12}>+ Добавить действие / сцену</button>
   {hasUnsavedChanges&&<p role="status" className="personaScenarioError">Есть несохранённые правки. Предыдущее утверждение не распространяется на изменённый текст.</p>}<label>Почему изменяется сценарий?<textarea aria-label="Причина новой редакции" value={revisionReason} onChange={event=>setRevisionReason(event.target.value)} placeholder="Что конкретно исправили, почему стало лучше?"/></label>
    <button type="button" className="ghost" disabled={Boolean(staleDraft||corruptDraft)} onClick={saveScript}>Сохранить новую версию</button>
    <button type="button" className="ghost" onClick={exportLocalAiTask} disabled={hasUnsavedChanges||Boolean(staleDraft||corruptDraft)}>Экспорт для локального сценарного ИИ · 0 кредитов</button>
    <small>Windows: npm run persona:scenario:local -- persona-scenario-input.json persona-draft-brief.json. Исходник остаётся на вашем ПК.</small>
    <label>Импортировать редакцию локального ИИ в новую версию сценария<input aria-label="Импортировать редакцию локального ИИ" disabled={Boolean(staleDraft||corruptDraft)} type="file" accept=".json,application/json" onChange={event=>{void importLocalAiRevision(event.target.files?.[0]);event.target.value=''}}/></label>
    <small>Импорт не принимает никакого предыдущего утверждения. После редакторской проверки и вашего утверждения новая версия перейдёт в Production Brief без шаблонной перегенерации.</small>
    <PersonaScenarioVersionHistory
      key={`history:${project.id}:${script.currentRevisionId}`}
      script={script}
      unsavedChanges={hasUnsavedChanges||Boolean(staleDraft||corruptDraft)}
      onRestore={next=>{
        // Propagate a rejected lock check to the history component so it cannot display false success.
        assertPersonaAuthorLockedLines(workspace,next.currentRevision.beats,script.idea.id);
        update({script:next});
        setBeats(next.currentRevision.beats);
        setError('');
      }}
    />
    <PersonaLocalScriptDoctorPanel
      key={`doctor:${project.id}:${script.currentRevisionId}`}
      script={script}
      creativeProfile={effectiveProfile}
      latestAuthorFeedback={workspace.editorialFeedback?.at(-1)?.comment}
      unsavedChanges={hasUnsavedChanges||Boolean(staleDraft||corruptDraft)}
      onAcceptRevision={next=>{
        // Child Script Doctor handles thrown errors; never report acceptance when a pinned line changed.
        assertPersonaAuthorLockedLines(workspace,next.currentRevision.beats,script.idea.id);
        update({script:next});
        setBeats(next.currentRevision.beats);
        setError('');
      }}
      onRejectSuggestion={(reason,sourceRevisionId)=>{
        update({editorialFeedback:[
          ...(workspace.editorialFeedback??[]),
          {revisionId:sourceRevisionId,
           comment:'Отклонено предложение Script Doctor: '+reason,
           createdAt:new Date().toISOString()}
        ]});
      }}
    />
    <div className="personaScenarioFeedback">
      <h5>Редакторская критика автора</h5>
      <label>Почему текущую версию нужно переделать<textarea aria-label="Причина отклонения сценария" value={rejectionFeedback} onChange={event=>setRejectionFeedback(event.target.value)} placeholder="Например: слабая эскалация, предсказуемый финал, реплики слишком искусственные"/></label>
      <button type="button" className="ghost" onClick={rejectWithFeedback} disabled={rejectionFeedback.trim().length<12}>Сохранить причину отклонения</button>
      {(workspace.editorialFeedback??[]).length>0&&<p className="personaScenarioHint">Сохранено критических замечаний: {workspace.editorialFeedback?.length}. Они будут учитываться как ограничения при следующем формировании идей.</p>}
    </div>
   {review&&<div className="personaScenarioReview"><h5>Script Doctor</h5><ul>{review.findings.map(finding=><li key={`${finding.role}-${finding.code}`} className={finding.severity}>{finding.role}: {finding.message}</li>)}</ul></div>}
   {!isApproved&&<div className="personaScenarioApproval"><h5>Авторское утверждение</h5><label>Автор<input aria-label="Автор сценария" value={author} onChange={event=>setAuthor(event.target.value)} placeholder="Ваше имя"/></label><label>Комментарий<textarea aria-label="Комментарий автора" value={comment} onChange={event=>setComment(event.target.value)} placeholder="Что вы подтверждаете для съёмки"/></label><button type="button" className="primary" disabled={hasUnsavedChanges||review?.status!=='ready_for_author'||!author.trim()||!comment.trim()} onClick={approveScript}>Утвердить сценарий</button></div>}
   {isApproved&&<><p className="personaScenarioHint">В памяти форматов сохранены только одобренные вами приёмы, без выдуманных охватов: {workspace.formatMemory?.length??0}.</p><button type="button" className="primary" onClick={createBrief}>Создать съёмочный бриф</button></>}
  </section>}
  {error&&<p className="personaScenarioError" role="alert">{error}</p>}
 </section>;
}
