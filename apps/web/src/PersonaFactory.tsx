import React from 'react';
import PersonaMvpSteps,{REEL_MVP_STEPS,reelMvpIndex,type PersonaMvpWorkspaceStep} from './PersonaMvpSteps';
import PersonaPhotoEditor from './PersonaPhotoEditor';
import PersonaCarouselEditor from './PersonaCarouselEditor';
import PersonaVideoTimeline from './PersonaVideoTimeline';
import {PersonaLocalRenderReview} from './PersonaLocalRenderReview';
import {PersonaColorComparisonStudio} from './PersonaColorComparisonStudio';
import {hasAuthoredPersonaColorReview,readPersonaColorComparisonRecord,samePersonaColorComparisonEvidence,type PersonaColorComparisonRecord} from './personaColorComparison';
import {readPersonaLocalRenderRecord,isPersonaDraftCurrentForApproval,type PersonaLocalRenderRecord} from './personaLocalRenderImport';
import {PersonaLocalProductionHandoff,assessPersonaLocalHandoff} from './PersonaLocalProductionHandoff';
// These two modules differ only by case before their extension. Explicit
// extensions keep Vite on Windows from resolving the view import to the
// data-only module.
import {PersonaAiMediaWorker} from './PersonaAiMediaWorker.tsx';
import {readPersonaAiMediaJob,type PersonaAiMediaJob} from './personaAiMediaWorker.ts';
import PersonaEditorialCalendar from './PersonaEditorialCalendar';
import PersonaCloudPanel from './PersonaCloudPanel';
import PersonaScenarioWorkspace from './PersonaScenarioWorkspace';
// `personaProductionGuide.ts` is the data model with a case-differing basename.
// The explicit extension keeps Vite on Windows from resolving this view import
// to the data module.
import {PersonaProductionGuide} from './PersonaProductionGuide.tsx';
import {PersonaShootNow} from './PersonaShootNow.tsx';
import {personaDirectorToBrief,readPersonaDirectorProposal} from '../../../packages/core/src/persona-director-model';
import {buildPersonaShootPlan} from './personaShootNow';
import {actorComposerPilot,isActorComposerPilot,createActorComposerWorkingBrief,createPersonaProductionGuide,updateGuideShotNote,migrateActorComposerShotNotes,applyPersonaGuideToBrief,type PersonaProductionGuide as ProductionGuide} from './personaProductionGuide';
import { addImportedBriefScenario } from './personaBriefScenarioBridge';
import { personaScenarioDraftExists, resolvePersonaScenarioDraftStorage } from './personaScenarioDraftJournal';
import {applyProductionInputField,productionBriefSnapshot,readProductionInputRaw,parseProductionInputDraft,saveProductionInputDraft,clearProductionInputDraft,productionInputDraftExists} from './personaProductionInputJournal';
import DataPortability from './DataPortability';
import{useEffect,useMemo,useRef,useState}from'react';
import{applyPersonaImportedProductionBrief,applyPersonaProductionMilestone,createPersonaProject,assertPersonaAsyncImportTarget,loadPersonaProjects,resolvePersonaProjectSaveBase,savePersonaProject,selectPersonaProject,type PersonaContentType,type PersonaProject,type PersonaProjectCollection,type PersonaScenarioWorkspace as ScenarioWorkspace}from'./personaProjectStore';
import type { PersonaTimelineSettings } from './personaTimelineSettings';
import'./persona-factory-v2.css';
import'./persona-production-brief.css';
import{
 advancePersonaProductionPipeline,
 importPersonaProductionBrief,
 recordPersonaEditorialDecision,
 revisePersonaProductionBrief,
 startPersonaProductionPipeline,
 type PersonaProductionPipeline,
}from'../../../packages/core/src/persona-production-pipeline';
import type { PersonaProductionBrief } from '../../../packages/core/src/persona-production-brief';

type Idea={id:string;title:string;angle:string;format:'carousel'|'photo'|'reel'|'short'|'story';score:number;reason?:string;source?:string;status?:string};

/** Do not approve a production brief using older dialogue than the current script revision. */
/** The same rule is applied to tabs, project switches and browser hash navigation. */
export function canNavigateFromPersonaGuide(hasUnsavedChanges:boolean):boolean{
 return hasUnsavedChanges===false;
}
export function productionBriefMatchesBeats(
 brief:PersonaProductionBrief|undefined,
 beats:readonly {line:string;action:string;durationSec:number}[]|undefined,
):boolean{
 if(!beats)return true; // Older projects can carry a brief without Scenario Intelligence.
 if(!brief||brief.script.length!==beats.length)return false;
 return beats.every((beat,i)=>beat.line===brief.script[i]?.line&&
  beat.action===brief.script[i]?.action&&beat.durationSec===brief.script[i]?.durationSec);
}
/** A new saved script revision revokes any earlier human shoot approval without
 * mutating the brief or losing revision history. */
export function reconcilePersonaProductionWithScenario(
 pipeline:PersonaProductionPipeline|null,workspace:ScenarioWorkspace|undefined,
):PersonaProductionPipeline|null{
 if(!pipeline||!pipeline.materials.productionBrief||!workspace?.script||productionBriefMatchesBeats(
  pipeline.materials.productionBrief,workspace.script.currentRevision.beats))return pipeline;
 if(pipeline.stage==='QA'&&pipeline.statuses.QA==='needs_revision'&&
  !pipeline.materials.editorialDecision)return pipeline;
 const {editorialDecision:_supersededApproval,...materials}=pipeline.materials;
 return {...pipeline,stage:'QA',
  statuses:{...pipeline.statuses,QA:'needs_revision',READY_FOR_SHOOT:'pending'},
  materials};
}
export function buildPersonaProductionWorkflow(idea:Idea):PersonaProductionPipeline{
 let pipeline=startPersonaProductionPipeline({idea:{id:idea.id,title:idea.title,angle:idea.angle,format:idea.format}});
 for(let step=0;step<4;step+=1)pipeline=advancePersonaProductionPipeline(pipeline);
 return pipeline;
}

/** A blank quick-start project may adopt a validated imported brief's identity once.
 * Existing work is never silently relabelled to make a foreign brief fit. */
export function ideaForImportedBrief(current:Idea, brief:unknown, isBlankQuickStart:boolean):Idea{
 if(!isBlankQuickStart||!brief||typeof brief!=='object')return current;
 const candidate=brief as Partial<{sourceTitle:string;sourceAngle:string;sourceFormat:Idea['format']}>;
 if(typeof candidate.sourceTitle!=='string'||!candidate.sourceTitle.trim()||typeof candidate.sourceAngle!=='string'||!candidate.sourceAngle.trim()||!['reel','short','story','photo','carousel'].includes(candidate.sourceFormat as string))return current;
 return {...current,title:candidate.sourceTitle,angle:candidate.sourceAngle,format:candidate.sourceFormat!,source:'imported-brief'};
}


/** Always reopen the snapshot returned by storage, never a stale project card prop. */
export function selectedPersonaProjectSnapshot(
 collection:PersonaProjectCollection,projectId:string,
):PersonaProject{
 const selected=collection.projects.find(item=>item.id===projectId);
 if(!selected)throw new Error('unknown_persona_project');
 return selected;
}

/** Best-effort final flush for a debounced project snapshot when a tab is hidden or closed. */
export function registerPersonaExitFlush(
 targetWindow:Pick<Window,'addEventListener'|'removeEventListener'>,
 targetDocument:Pick<Document,'addEventListener'|'removeEventListener'|'visibilityState'>,
 flush:()=>void,
):()=>void{
 const onPageHide=()=>flush();
 const onVisibilityChange=()=>{if(targetDocument.visibilityState==='hidden')flush()};
 targetWindow.addEventListener('pagehide',onPageHide);
 targetDocument.addEventListener('visibilitychange',onVisibilityChange);
 return ()=>{
  targetWindow.removeEventListener('pagehide',onPageHide);
  targetDocument.removeEventListener('visibilitychange',onVisibilityChange);
 };
}

/** Force the editor's local React state to reset when its project or source revision changes. */
export function personaScenarioWorkspaceMountKey(projectId:string,workspace:ScenarioWorkspace|undefined):string{
 const script=workspace?.script;
 return [projectId,script?.idea?.id??'no-idea',script?.currentRevisionId??'no-revision']
  .map(value=>encodeURIComponent(value)).join(':');
}

export function PersonaProductionBriefPanel({projectId,pipeline,editor,comment,factsChecked,onEditorChange,onCommentChange,onFactsCheckedChange,onDecision,onRebuild,onAngleChange,onBriefChange}:{projectId:string;pipeline:PersonaProductionPipeline;editor:string;comment:string;factsChecked:boolean;onEditorChange:(value:string)=>void;onCommentChange:(value:string)=>void;onFactsCheckedChange:(value:boolean)=>void;onDecision:(decision:'approved'|'rejected')=>void;onRebuild:()=>void;onAngleChange:(value:string)=>void;onBriefChange:(brief:PersonaProductionBrief)=>boolean}){
 const brief=pipeline.materials.productionBrief;
 const qa=pipeline.materials.qa;
 // Hooks must execute on every render, even before a QA brief is available.
 const storage=resolvePersonaScenarioDraftStorage();
 const [raw,setRaw]=useState<string|null>(()=>{try{return readProductionInputRaw(storage,projectId)}catch{return null}});
 const rawRef=useRef(raw);
 const [inputError,setInputError]=useState('');
 const [discardChecked,setDiscardChecked]=useState(false);
 const [recoveryOnLoad]=useState(()=>raw!==null);
 if(!brief||!qa)return null;
 const requiresFactReview=qa.factReview.status==='requires_fact_review';
 const dirty=(pipeline.input.idea.angle.trim()!==brief.sourceAngle||pipeline.input.idea.title.trim()!==brief.sourceTitle||pipeline.input.idea.format!==brief.sourceFormat);
 const pending=parseProductionInputDraft(raw,projectId);
 const matching=Boolean(pending&&pending.ideaId===brief.ideaId&&pending.base===productionBriefSnapshot(brief));
 const unresolved=raw!==null&&!matching;
 const canApprove=editor.trim().length>0&&comment.trim().length>0&&(!requiresFactReview||factsChecked)&&qa.status!=='needs_revision'&&!dirty&&pipeline.stage==='QA'&&raw===null;
 const valueFor=(field:string,canonical:string)=>matching&&pending?.field===field?pending.value:canonical;
 const typeField=(field:string,value:string,element:HTMLTextAreaElement|HTMLInputElement,canonical:string)=>{
  try{
   if(unresolved)throw Error('Сначала разрешите черновик другой версии.');
   const next=saveProductionInputDraft(storage,{version:1,projectId,ideaId:brief.ideaId,base:productionBriefSnapshot(brief),field,value},rawRef.current);
   rawRef.current=next;setRaw(next);setInputError('');
  }catch(error){
   element.value=valueFor(field,canonical);
   setInputError('Ввод не защищён от закрытия страницы: '+String((error as Error).message||error));
  }
 };
 const commitField=(field:string,value:string)=>{
  const current=rawRef.current;
  if(current===null)return;
  const d=parseProductionInputDraft(current,projectId);
  if(!d||d.field!==field||d.value!==value||d.ideaId!==brief.ideaId||d.base!==productionBriefSnapshot(brief)){
   setInputError('Черновик относится к другой версии. Скопируйте его перед очисткой.');return;
  }
  try{
   if(readProductionInputRaw(storage,projectId)!==current)throw Error('Правка изменена в другой вкладке.');
   const next=applyProductionInputField(brief,field,value);
   if(next!==brief&&!onBriefChange(next)){
    setInputError('Бриф не удалось записать. Страховочная копия сохранена.');return;
   }
   clearProductionInputDraft(storage,projectId,current);
   rawRef.current=null;setRaw(null);setInputError('');setDiscardChecked(false);
  }catch(error){setInputError(String((error as Error).message||error))}
 };
 const discardDraft=()=>{
  if(!discardChecked||rawRef.current===null)return;
  try{
   clearProductionInputDraft(storage,projectId,rawRef.current);
   rawRef.current=null;setRaw(null);setInputError('');setDiscardChecked(false);
  }catch(error){setInputError('Не удалось удалить страховочную копию: '+String((error as Error).message||error))}
 };
 return <section className="productionBrief" aria-label="Съёмочный бриф">
  <div className="productionBriefHead"><div><small>ДЕТЕРМИНИРОВАННЫЙ ШАБЛОН · БЕЗ ВЫЗОВА AI</small><h3>Съёмочный бриф</h3><p>Создан из выбранной идеи. Это не результат реального ИИ и не готовый видеомонтаж.</p></div><span className={pipeline.stage==='READY_FOR_SHOOT'?'briefReady':'briefQa'}>{pipeline.stage==='READY_FOR_SHOOT'?'Можно снимать':'На редакторской проверке'}</span></div>
  <label className="briefEdit"><span>Смысл идеи</span><textarea aria-label="Смысл идеи для съёмочного брифа" value={pipeline.input.idea.angle} onChange={e=>onAngleChange(e.target.value)}/></label>
  {dirty&&<p role="alert" className="factReview">Идея изменена. Пересоберите бриф: прежние сценарий и QA устарели, одобрение заблокировано.</p>}
  {(pipeline.stage==='QA'||dirty)&&<div className="actions"><button className="ghost" onClick={onRebuild}>Обновить бриф после правки</button></div>}
  <p className="briefEditNotice">Правка сбросит предыдущее утверждение и повторно запустит структурную проверку.</p>
  {raw!==null&&(recoveryOnLoad||unresolved)&&<div className="briefIssues" role="status">
   <p><b>{unresolved?'Несохранённый текст из другой версии':'Незавершённая правка съёмочного брифа'}</b>. Эта копия не является утверждённой.</p>
   <textarea aria-label="Страховочная копия незавершённой правки" readOnly value={pending?.value??raw}/>
   {matching&&<button type="button" className="ghost" onClick={()=>commitField(pending!.field,pending!.value)}>Проверить и сохранить восстановленную правку</button>}
   <label><input type="checkbox" checked={discardChecked} onChange={e=>setDiscardChecked(e.target.checked)}/> Я скопировал нужный текст и разрешаю удалить копию</label>
   <button type="button" className="dangerGhost" disabled={!discardChecked} onClick={discardDraft}>Удалить страховочную копию</button>
  </div>}
  {raw!==null&&!recoveryOnLoad&&!unresolved&&<p role="status" className="briefEditNotice">Набираемый текст сохранён в страховочном журнале.</p>}
  {inputError&&<p role="alert" className="briefIssues">{inputError}</p>}
  <div className="briefGrid"><article><small>СЦЕНАРИЙ</small>{brief.script.map((beat,index)=><fieldset className="briefBeat" key={beat.order}><legend>Кадр {beat.order}</legend><label>Реплика<textarea aria-label={`Редактировать реплику ${beat.order}`} defaultValue={valueFor(`script:${index}:line`,beat.line)} onChange={e=>typeField(`script:${index}:line`,e.currentTarget.value,e.currentTarget,beat.line)} onBlur={e=>commitField(`script:${index}:line`,e.currentTarget.value)}/></label><label>Длительность, сек.<input aria-label={`Длительность кадра ${beat.order}`} type="number" min="0.1" step="0.1" defaultValue={valueFor(`script:${index}:durationSec`,String(beat.durationSec))} onChange={e=>typeField(`script:${index}:durationSec`,e.currentTarget.value,e.currentTarget,String(beat.durationSec))} onBlur={e=>commitField(`script:${index}:durationSec`,e.currentTarget.value)}/></label><label>Действие<textarea aria-label={`Сценарное действие ${beat.order}`} defaultValue={valueFor(`script:${index}:action`,beat.action)} onChange={e=>typeField(`script:${index}:action`,e.currentTarget.value,e.currentTarget,beat.action)} onBlur={e=>commitField(`script:${index}:action`,e.currentTarget.value)}/></label></fieldset>)}</article><article><small>КАДРЫ</small>{brief.shots.map((shot,index)=><fieldset className="briefBeat" key={shot.order}><legend>Кадр {shot.order} · {shot.framing}</legend><label>Ракурс<textarea aria-label={`Ракурс кадра ${shot.order}`} defaultValue={valueFor(`shot:${index}:angle`,shot.angle)} onChange={e=>typeField(`shot:${index}:angle`,e.currentTarget.value,e.currentTarget,shot.angle)} onBlur={e=>commitField(`shot:${index}:angle`,e.currentTarget.value)}/></label><label>Движение камеры<textarea aria-label={`Движение камеры ${shot.order}`} defaultValue={valueFor(`shot:${index}:cameraMovement`,shot.cameraMovement)} onChange={e=>typeField(`shot:${index}:cameraMovement`,e.currentTarget.value,e.currentTarget,shot.cameraMovement)} onBlur={e=>commitField(`shot:${index}:cameraMovement`,e.currentTarget.value)}/></label><label>Свет<textarea aria-label={`Свет кадра ${shot.order}`} defaultValue={valueFor(`shot:${index}:lighting`,shot.lighting)} onChange={e=>typeField(`shot:${index}:lighting`,e.currentTarget.value,e.currentTarget,shot.lighting)} onBlur={e=>commitField(`shot:${index}:lighting`,e.currentTarget.value)}/></label><label>Съёмочное указание<textarea aria-label={`Съёмочное указание ${shot.order}`} defaultValue={valueFor(`shot:${index}:action`,shot.action)} onChange={e=>typeField(`shot:${index}:action`,e.currentTarget.value,e.currentTarget,shot.action)} onBlur={e=>commitField(`shot:${index}:action`,e.currentTarget.value)}/></label></fieldset>)}</article></div>
  <div className="briefNotes"><p><b>Звук:</b> {brief.capture.audio.recording}</p><p><b>Монтаж:</b> {brief.postProduction.transitions}</p><p><b>Титры:</b> до {brief.postProduction.subtitles.maxCharactersPerLine} символов в строке.</p></div>
  <div className={qa.status==='needs_revision'?'briefIssues':'briefChecks'}><b>{qa.status==='needs_revision'?'Нужны правки структуры':'Проверка брифа'}</b><ul>{qa.structuralChecks.map(check=><li key={check.id} className={check.passed?'ok':'bad'}>{check.passed?'✓':'!'} {check.message}</li>)}</ul>{requiresFactReview&&<p className="factReview"><b>Нужна ручная проверка фактов.</b> {qa.factReview.message}</p>}</div>
  {pipeline.stage==='QA'&&<div className="editorialGate"><h4>Редакторское решение</h4><p>Сценарий, кадры и бриф сохранятся при отклонении.</p><input aria-label="Имя редактора" value={editor} onChange={e=>onEditorChange(e.target.value)} placeholder="Имя редактора"/><textarea aria-label="Комментарий редактора" value={comment} onChange={e=>onCommentChange(e.target.value)} placeholder="Комментарий: что подтверждено или что исправить"/>{requiresFactReview&&<label><input type="checkbox" checked={factsChecked} onChange={e=>onFactsCheckedChange(e.target.checked)}/> Факты в свободных репликах сверены с автором или источником.</label>}<div className="actions"><button className="dangerGhost" disabled={!editor.trim()||!comment.trim()} onClick={()=>onDecision('rejected')}>Вернуть на доработку</button><button className="primary" disabled={!canApprove} onClick={()=>onDecision('approved')}>Одобрить для съёмки</button></div></div>}
  {pipeline.materials.editorialDecision&&<p className="decisionLog"><b>{pipeline.materials.editorialDecision.decision==='approved'?'Одобрено':'Возвращено на доработку'}:</b> {pipeline.materials.editorialDecision.editor} · {pipeline.materials.editorialDecision.comment}</p>}
  {brief.sourceFormat==='reel'&&<PersonaLocalProductionHandoff pipeline={pipeline} projectId={projectId} hasUnsavedDraft={raw!==null}/>}
 </section>;
}
/** Preserve the complete user brief for the model. The short title is display-only. */
export function buildCustomPersonaIdea(input: string, format: 'reel'|'carousel'): Idea {
 const fullBrief=input.trim().replace(/\s+/g,' ').slice(0,3000);
 if (!fullBrief) throw new Error('Нужно написать идею');
 return {id:'user-'+Date.now(),title:fullBrief.slice(0,90)+(fullBrief.length>90?'…':''),
   angle:fullBrief,format,score:0,source:'user'};
}

type Slide={eyebrow:string;title:string;body:string};
type Draft={title:string;slides:Slide[];caption:string;platformNotes:{instagram:string;vk:string;youtube:string};style?:'editorial'|'old-money'|'documentary'|'minimal';assetInstruction?:string};
type QA={pass:boolean;score:number;issues:{target:string;instruction:string}[]};
type MediaProbe={name:string;bytes:number;mime:string;kind:'video'|'image';width?:number;height?:number;durationSec?:number;error?:string};
type Stage='strategy'|'needs_assets'|'production'|'marketing_qa'|'media_qa'|'final_qa'|'approval';
type PersonaScreen='home'|'projects'|'project';
type WorkspaceStep=PersonaMvpWorkspaceStep;
type ProductionMilestone={pipeline:PersonaProductionPipeline;stage?:Stage;step?:WorkspaceStep;resetQa?:boolean};
const HISTORY='lifeos:persona:idea-history:v2';
const PRODUCTION_DRAFT='lifeos:persona:production-draft:v1';
const stages:[Stage,string][]=[['strategy','Стратегия'],['needs_assets','Исходник'],['production','Производство'],['marketing_qa','Маркетолог'],['media_qa','Медиа QA'],['final_qa','Самопроверка'],['approval','Твоё решение']];
function read<T>(key:string,fallback:T):T{try{const x=JSON.parse(localStorage.getItem(key)||'');return x??fallback}catch{return fallback}}
function save(key:string,value:unknown){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
function localIdeas(history:{title:string;status:string}[]):Idea[]{const blocked=new Set(history.filter(x=>x.status==='used'||x.status==='rejected').map(x=>x.title.toLowerCase()));const seed:[string,string,Idea['format']][]=[['Что зритель не видит за минуту до спектакля','Закулисье через один конкретный момент','carousel'],['Почему хорошая сцена начинается до выхода на сцену','Подготовка как часть профессии','reel'],['Как четыре ноты превращаются в сцену','Музыкальное зерно → драматургия → оркестр','carousel'],['Одна ошибка, которая сделала сцену сильнее','Конфликт, решение и результат','carousel'],['Что актёр делает, когда проба не получается','Честный процесс без образа успеха','carousel'],['Как рождается аранжировка','От фортепиано до готового звучания','reel'],['Что меняется после сотни проб','Наблюдение без мотивационного пафоса','short'],['Один день между театром и музыкой','Соединить две профессии одной историей','reel'],['Почему красивого кадра недостаточно','Смысл важнее визуального блеска','photo'],['Фрагмент будущего мюзикла','Тизер проекта без спойлеров','short'],['Три вещи, которые зритель не замечает','Curiosity gap + конкретные детали','carousel'],['Из заметки в готовую сцену','Показать реальный творческий pipeline','reel'],['Что происходит после «стоп, снято»','Момент, который обычно вырезают','reel'],['Как понять, что идея для поста слабая','Самопроверка автора до публикации','carousel'],['Почему я не хочу показывать только результат','Личный манифест о процессе','carousel'],['Одна репетиция, которую стоило бы увидеть зрителю','Невидимая работа перед спектаклем','reel'],['Как одна фраза меняет весь номер','Драматургия через микродеталь','carousel'],['Что показать человеку, который впервые пришёл в театр','Вход в мир через личное наблюдение','photo'],['Почему некоторые идеи лучше оставить на потом','Как работает творческий банк','carousel'],['Что реально помогает пережить провальную пробу','Практический опыт без наставничества','carousel'],['Как один предмет может рассказать о роли','Предмет как драматургический якорь','photo'],['Что остаётся после репетиции','Один честный кадр вместо отчёта','photo'],['Как понять, что сцена уже живая','Признаки, которые замечает актёр','carousel'],['Почему процесс иногда интереснее результата','История через незавершённость','carousel']];return seed.filter(x=>!blocked.has(x[0].toLowerCase())).map((x,i)=>({id:`local-${i+1}`,title:x[0],angle:x[1],format:x[2],score:96-i*2,status:'candidate',source:'editorial-bank'}))}
async function api(payload:any){const r=await fetch('/api/persona',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data?.error||'pipeline_unavailable');return data}
function styleClass(style:string|undefined){return style||'editorial'}
function newProjectId(){return typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'?crypto.randomUUID():`persona-${Date.now()}-${Math.random().toString(36).slice(2)}`}
/** Zero-credit local startup must not make a hidden API request. */
export function shouldRequestPersonaPlan(autoPlan:boolean){return autoPlan===true}
function projectIdea(project:PersonaProject):Idea{return{id:project.id,title:project.title,angle:project.sourceIdea,format:project.contentType,score:0,source:'project'}}
function projectStage(value:unknown):Stage{return value==='strategy'||value==='needs_assets'||value==='production'||value==='marketing_qa'||value==='media_qa'||value==='final_qa'||value==='approval'?value:'strategy'}
function contentTypeLabel(value:PersonaContentType|undefined){return value==='photo'?'Фото':value==='carousel'?'Карусель':value==='short'?'Shorts':value==='story'?'Stories':'Reels'}
function stageLabel(value:Stage){return ({strategy:'Идея',needs_assets:'Исходники',production:'В работе',marketing_qa:'Проверка',media_qa:'Проверка медиа',final_qa:'Проверка',approval:'Готово к съёмке'} as Record<Stage,string>)[value]}
function screenFromHash():PersonaScreen{const hash=typeof location==='undefined'?'':location.hash;return hash.startsWith('#persona/projects')?'projects':hash.startsWith('#persona/project')?'project':'home'}
function workspaceStepsFor(format:PersonaContentType|undefined):[WorkspaceStep,string][]{
 if(format==='photo')return [['assets','Исходник'],['edit','Обработка'],['review','Проверка'],['export','Экспорт']];
 if(format==='carousel')return [['assets','Изображения'],['edit','Оформление'],['review','Проверка'],['export','Экспорт']];
 return [['guide','План съёмки'],['idea','Идея'],['script','Сценарий'],['assets','Исходники'],['edit','Монтаж'],['review','Проверка'],['export','Экспорт']];
}
function workspaceStepFrom(value:unknown,format:PersonaContentType|undefined):WorkspaceStep{const steps=workspaceStepsFor(format);return steps.some(([id])=>id===value)?value as WorkspaceStep:steps[0][0]}
export default function PersonaFactory(){
 const projectBootstrap=useRef<PersonaProjectCollection|null>(null);if(projectBootstrap.current===null)projectBootstrap.current=loadPersonaProjects(resolvePersonaScenarioDraftStorage(),newProjectId);const initialProject=projectBootstrap.current.projects.find(project=>project.id===projectBootstrap.current?.activeProjectId)??null;
 const lastOwnSavedRevision=useRef<{id:string;revision:number}|null>(initialProject?{id:initialProject.id,revision:initialProject.revision}:null);
 const pendingAutosave=useRef(false);
 const guideDirty=useRef(false);
 const[guideGuardMessage,setGuideGuardMessage]=useState('');
 const[projects,setProjects]=useState<PersonaProject[]>(()=>projectBootstrap.current?.projects??[]);const[activeProjectId,setActiveProjectId]=useState<string|null>(()=>projectBootstrap.current?.activeProjectId??null);const[timeline,setTimeline]=useState<PersonaTimelineSettings|null>(()=>initialProject?.timeline as PersonaTimelineSettings|null??null);
 const[screen,setScreen]=useState<PersonaScreen>(screenFromHash);
 const[workspaceStep,setWorkspaceStep]=useState<WorkspaceStep>(()=>workspaceStepFrom(initialProject?.lastOpenStep,initialProject?.contentType));
 const[saveState,setSaveState]=useState<'saved'|'saving'|'error'>('saved');
 const[scenarioWorkspace,setScenarioWorkspace]=useState<ScenarioWorkspace|undefined>(()=>initialProject?.scenarioWorkspace);
 const[localRenderReview,setLocalRenderReview]=useState<PersonaLocalRenderRecord|null>(()=>readPersonaLocalRenderRecord(initialProject?.processing));
 const[colorComparison,setColorComparison]=useState<PersonaColorComparisonRecord|null>(()=>readPersonaColorComparisonRecord(initialProject?.colorComparison));
 const[aiMediaJob,setAiMediaJob]=useState<PersonaAiMediaJob|null>(()=>readPersonaAiMediaJob(initialProject?.aiMediaJob));
 const[h,setH]=useState<{title:string;status:string}[]>(()=>read(HISTORY,[]));const[ideas,setIdeas]=useState<Idea[]>(()=>localIdeas(h));const[chosen,setChosen]=useState<Idea|null>(()=>initialProject?projectIdea(initialProject):read('persona:active-idea:v1',null));const[draft,setDraft]=useState<Draft|null>(()=>initialProject?.script as Draft|null??read('persona:active-draft:v1',null));const[qa,setQa]=useState<QA|null>(()=>initialProject?.qa as QA|null??read('persona:active-qa:v1',null));const[stage,setStage]=useState<Stage>(()=>{
  if(initialProject){
   const savedPipeline=initialProject.shootingPlan as PersonaProductionPipeline|null;
   return reconcilePersonaProductionWithScenario(savedPipeline,initialProject.scenarioWorkspace)!==savedPipeline
    ?'final_qa':projectStage(initialProject.stage);
  }
  return read<Idea|null>('persona:active-idea:v1',null)?read<Stage>('persona:active-stage:v1','strategy'):'strategy';
 });const[feedback,setFeedback]=useState('');const[recording,setRecording]=useState(false);const[transcribing,setTranscribing]=useState(false);const[working,setWorking]=useState(false);const[directorWorking,setDirectorWorking]=useState(false);const[status,setStatus]=useState('');const[showBank,setShowBank]=useState(false);const[asset,setAsset]=useState<string|null>(null);const[assetName,setAssetName]=useState('');const[mediaProbe,setMediaProbe]=useState<MediaProbe|null>(()=>initialProject?.mediaAssets[0] as MediaProbe|null??null);const[autoPlan,setAutoPlan]=useState(false);const[customIdea,setCustomIdea]=useState('');const[customFormat,setCustomFormat]=useState<'reel'|'carousel'>('reel');const[engineMode,setEngineMode]=useState<'ai'|'template'|'unknown'>('unknown');const[useFreeAI,setUseFreeAI]=useState(false);const[assetIsVideo,setAssetIsVideo]=useState(false);const[production,setProduction]=useState<PersonaProductionPipeline|null>(()=>reconcilePersonaProductionWithScenario(initialProject?.shootingPlan as PersonaProductionPipeline|null??read(PRODUCTION_DRAFT,null),initialProject?.scenarioWorkspace));const[productionEditor,setProductionEditor]=useState('');const[productionComment,setProductionComment]=useState('');const[productionFactsChecked,setProductionFactsChecked]=useState(false);const mediaProbeSequence=useRef(0);const assetUrlRef=useRef<string|null>(null);const rec=useRef<MediaRecorder|null>(null);const stream=useRef<MediaStream|null>(null);const chunks=useRef<Blob[]>([]);
 useEffect(()=>{save('persona:active-idea:v1',chosen)},[chosen]);
 useEffect(()=>{save('persona:active-draft:v1',draft)},[draft]);
 useEffect(()=>{save('persona:active-qa:v1',qa)},[qa]);
 useEffect(()=>{save('persona:active-stage:v1',stage)},[stage]);

 useEffect(()=>{save(PRODUCTION_DRAFT,production)},[production]);
 useEffect(()=>{const sync=()=>{
  if(guideDirty.current&&activeProjectId&&screenFromHash()!=='project'){
   history.replaceState(null,'','#persona/project/'+activeProjectId);
   setGuideGuardMessage('Есть несохранённые правки плана. Повторите сохранение или скачайте съёмочный лист перед переходом.');
   return;
  }
  setScreen(screenFromHash());
 };window.addEventListener('hashchange',sync);return()=>window.removeEventListener('hashchange',sync)},[activeProjectId]);
 function saveActiveProject(nextScenarioWorkspace?:ScenarioWorkspace,ideaForSave:Idea|null=chosen,importedProduction?:PersonaProductionPipeline,milestone?:ProductionMilestone,localRenderOverride?:PersonaLocalRenderRecord,colorComparisonOverride?:PersonaColorComparisonRecord,aiMediaOverride?:PersonaAiMediaJob){
  if(!activeProjectId||!ideaForSave)return;
  try{
   const rendered=projects.find(project=>project.id===activeProjectId);
   if(!rendered)throw new Error('persona_project_missing_in_view');
   // React's project list can lag our own synchronous writes. Track this tab's
   // successful write revision while rejecting updates from other tabs.
   const expectedRevision=lastOwnSavedRevision.current?.id===activeProjectId
    ?lastOwnSavedRevision.current.revision:rendered.revision;
   const previous=resolvePersonaProjectSaveBase(localStorage,{...rendered,revision:expectedRevision});
   const now=new Date().toISOString();
   const candidate:PersonaProject={...previous,title:ideaForSave.title,contentType:ideaForSave.format as PersonaContentType,sourceIdea:ideaForSave.angle,script:draft,shootingPlan:production,editPlan:production,timeline,mediaAssets:mediaProbe?[mediaProbe]:previous.mediaAssets,processing:localRenderOverride??previous.processing,colorComparison:colorComparisonOverride??previous.colorComparison,aiMediaJob:aiMediaOverride??previous.aiMediaJob,captions:draft?.platformNotes??previous.captions,socialCaptions:draft?.platformNotes??previous.socialCaptions,scenarioWorkspace:nextScenarioWorkspace??previous.scenarioWorkspace,stage,qa,lastOpenStep:workspaceStep,updatedAt:now,revision:previous.revision+1};
   const next=importedProduction&&nextScenarioWorkspace
    ?applyPersonaImportedProductionBrief(candidate,importedProduction,nextScenarioWorkspace)
    :milestone?applyPersonaProductionMilestone(candidate,milestone.pipeline,
     {stage:milestone.stage,lastOpenStep:milestone.step,resetQa:milestone.resetQa}):candidate;
   const collection=savePersonaProject(localStorage,next,activeProjectId);
   lastOwnSavedRevision.current={id:activeProjectId,revision:next.revision};
   pendingAutosave.current=false;
   setProjects(collection.projects);
   return true;
  }catch{
   setSaveState('error');
   setStatus('Не удалось сохранить: проект изменился в другой вкладке или хранилище недоступно. Не закрывайте текущий черновик; откройте актуальную версию после проверки.');
   return false;
  }
 }
 /** Persist the scenario version before telling the editor that its change succeeded. */
 function persistLocalRenderReview(record:PersonaLocalRenderRecord):boolean{
  if(!activeProjectId||!chosen||record.projectId!==activeProjectId)return false;
  try{
   const live=loadPersonaProjects(localStorage,newProjectId);
   const saved=live.projects.find(item=>item.id===activeProjectId);
   const savedPipeline=saved?.shootingPlan as PersonaProductionPipeline|null;
   const savedBrief=savedPipeline?.materials?.productionBrief;
   if(live.activeProjectId!==activeProjectId||saved?.contentType!=='reel'||
    !savedBrief||JSON.stringify(savedBrief)!==record.briefSnapshot||
    !productionBriefMatchesBeats(savedBrief,saved?.scenarioWorkspace?.script?.currentRevision.beats)||
    !savedPipeline||!assessPersonaLocalHandoff(savedPipeline,
     productionInputDraftExists(localStorage,activeProjectId)).allowed)
    throw Error('Сценарий или редакторское решение изменились во время проверки видео.');
   if(!readPersonaLocalRenderRecord(record))
    throw Error('Импортированные сведения о видео не прошли проверку.');
   if(!isPersonaDraftCurrentForApproval({
    record,projectId:activeProjectId,briefSnapshot:JSON.stringify(savedBrief),
    handoffAllowed:true,
    approvalDecidedAt:savedPipeline.materials.editorialDecision?.decision==='approved'
     ?savedPipeline.materials.editorialDecision.decidedAt:null,
   }))throw Error('MP4 импортирован до текущего авторского утверждения Production Brief. Требуется повторный импорт файлов.');
   const previousRecord=readPersonaLocalRenderRecord(saved.processing);
   if(record.finished){
    if(!previousRecord||previousRecord.mp4Sha256!==record.mp4Sha256||
       previousRecord.briefFingerprintSha256!==record.briefFingerprintSha256||
       previousRecord.importedAt!==record.importedAt)
     throw Error('Заменён исходный черновик, нужен новый импорт финального MP4.');
    if(record.finished.authorReview&&
       previousRecord.finished?.finishedSha256!==record.finished.finishedSha256)
     throw Error('Нельзя утвердить MP4, который не сохранён в этом проекте.');
   }
   if(!saveActiveProject(undefined,chosen,undefined,undefined,record))return false;
   setLocalRenderReview(record);
   return true;
  }catch(error){setStatus('Не удалось сохранить импорт: '+String((error as Error).message||error));return false}
 }
 function persistColorComparison(next:PersonaColorComparisonRecord):boolean{
  if(!activeProjectId||!chosen||!readPersonaColorComparisonRecord(next))return false;
  try{
   const live=loadPersonaProjects(localStorage,newProjectId);
   const saved=live.projects.find(project=>project.id===activeProjectId);
   if(live.activeProjectId!==activeProjectId||!saved||saved.contentType!=='reel')
    throw Error('Был открыт другой проект или выбран неподходящий формат.');
   const previous=readPersonaColorComparisonRecord(saved.colorComparison);
   if(saved.colorComparison!==undefined&&!previous)
    throw Error('Сохранённая запись Comparison Studio повреждена. Исходные данные сохранены в проекте; заменять их новым импортом нельзя до восстановления или резервного копирования.');
   // Every authored artistic decision, rejection, historical choice or timestamped
   // observation must match this project's exact previously verified MP4 hashes.
   // A new unrelated source can only be imported without inherited author review.
   if(hasAuthoredPersonaColorReview(next)&&(!previous||!samePersonaColorComparisonEvidence(previous,next)))
    throw Error('Нельзя сохранить художественную оценку, отказ или заметки от другого MP4. Импортируйте файлы заново.');
   if(!saveActiveProject(undefined,chosen,undefined,undefined,undefined,next))return false;
   setColorComparison(next);
   return true;
  }catch(error){
   setStatus('Comparison Studio: '+String((error as Error).message||error));
   return false;
  }
 }
 function persistAiMediaJob(next:PersonaAiMediaJob):boolean{
  if(!activeProjectId||!chosen||next.projectId!==activeProjectId||!readPersonaAiMediaJob(next))return false;
  try{const live=loadPersonaProjects(localStorage,newProjectId);const saved=live.projects.find(project=>project.id===activeProjectId);const savedPipeline=saved?.shootingPlan as PersonaProductionPipeline|null;
   if(live.activeProjectId!==activeProjectId||saved?.contentType!=='reel'||!savedPipeline||JSON.stringify(savedPipeline.materials.productionBrief)!==next.briefSnapshot||!productionBriefMatchesBeats(savedPipeline.materials.productionBrief,saved.scenarioWorkspace?.script?.currentRevision.beats)||!assessPersonaLocalHandoff(savedPipeline,productionInputDraftExists(localStorage,activeProjectId)).allowed)throw Error('Бриф или проект изменились во время локального монтажа. MP4 сохранён Worker, но не привязан к устаревшему проекту.');
   if(!saveActiveProject(undefined,chosen,undefined,undefined,undefined,undefined,next))return false;setAiMediaJob(next);return true;
  }catch(error){setStatus('Не удалось сохранить результат Worker: '+String((error as Error).message||error));return false}
 }
 function persistScenarioWorkspace(next:ScenarioWorkspace,ideaForSave:Idea|null=chosen,importedProduction?:PersonaProductionPipeline){
  const reconciled=importedProduction??reconcilePersonaProductionWithScenario(production,next);
  const revoked=Boolean(!importedProduction&&production&&reconciled!==production);
  const milestone=revoked&&reconciled
   ?{pipeline:reconciled,stage:'final_qa' as const,resetQa:true}
   :undefined;
  // One atomic project write: the revised script and revoked approval cannot be
  // stored as independently saveable snapshots.
  if(!activeProjectId||!ideaForSave||!saveActiveProject(next,ideaForSave,importedProduction,milestone))
   throw new Error('Не удалось записать версию сценария в хранилище проекта. Черновик сохранён отдельно.');
  setScenarioWorkspace(next);
  if(revoked&&reconciled){
   setProduction(reconciled);
   setStage('final_qa');setQa(null);
   setProductionEditor('');setProductionComment('');setProductionFactsChecked(false);
   setStatus('Сценарий изменился: прежнее утверждение съёмочного брифа отозвано. Бриф и история сохранены, но их нужно согласовать с текущими репликами и повторно пройти QA.');
  }
 }
 /** Never present a production decision as saved before browser storage confirms it. */
 function persistProductionMilestone(next:PersonaProductionPipeline,options:Omit<ProductionMilestone,'pipeline'>={}){
  if(!activeProjectId||!chosen||!saveActiveProject(undefined,chosen,undefined,{pipeline:next,...options}))
   throw new Error('Хранилище не подтвердило сохранение съёмочного брифа. Предыдущее решение сохранено.');
  setProduction(next);
  if(options.stage)setStage(options.stage);
  if(options.step)setWorkspaceStep(options.step);
  if(options.resetQa)setQa(null);
 }
 useEffect(()=>{
  if(!activeProjectId||!chosen)return;
  pendingAutosave.current=true;
  setSaveState('saving');
  const timer=window.setTimeout(()=>{
   if(pendingAutosave.current&&saveActiveProject())setSaveState('saved');
  },350);
  return()=>window.clearTimeout(timer);
 },[activeProjectId,chosen,draft,qa,stage,production,timeline,mediaProbe,workspaceStep,scenarioWorkspace]);
 useEffect(()=>{
  if(!activeProjectId||!chosen)return;
  const flush=()=>{
   if(pendingAutosave.current)saveActiveProject();
  };
  return registerPersonaExitFlush(window,document,flush);
 },[activeProjectId,chosen,draft,qa,stage,production,timeline,mediaProbe,workspaceStep,scenarioWorkspace]);
 const visibleIdeas=useMemo(()=>ideas.filter(x=>x.status!=='used'&&x.status!=='rejected'),[ideas]);
 useEffect(()=>{save(HISTORY,h)},[h]);
 useEffect(()=>{if(!shouldRequestPersonaPlan(autoPlan)){setIdeas(localIdeas(h));return}let cancelled=false;(async()=>{try{const data=await api({action:'plan',history:h,seed:localIdeas(h).slice(0,24),auto:true});if(!cancelled&&Array.isArray(data.ideas)&&data.ideas.length>=10)setIdeas(data.ideas)}catch{if(!cancelled)setIdeas(localIdeas(h))}})();return()=>{cancelled=true}},[h,autoPlan]);
 useEffect(()=>()=>{mediaProbeSequence.current+=1;if(assetUrlRef.current)URL.revokeObjectURL(assetUrlRef.current);try{if(rec.current?.state==='recording')rec.current.stop()}catch{}stream.current?.getTracks().forEach(t=>t.stop())},[]);
 function remember(idea:Idea,status:'later'|'rejected'|'used'){setH(v=>[...v.filter(x=>x.title!==idea.title),{title:idea.title,status}]);setIdeas(v=>v.map(x=>x.title===idea.title?{...x,status}:x))}
 function resetLocalAsset(){mediaProbeSequence.current+=1;if(assetUrlRef.current){URL.revokeObjectURL(assetUrlRef.current);assetUrlRef.current=null}setAsset(null);setAssetName('');setAssetIsVideo(false)}
 function canLeaveGuide():boolean{
  if(canNavigateFromPersonaGuide(guideDirty.current))return true;
  setGuideGuardMessage('Есть несохранённые изменения в «Плане съёмки». Повторите сохранение или скачайте съёмочный лист, прежде чем уходить.');
  return false;
 }
 function select(idea:Idea){
  if(!canLeaveGuide())return false;
  if(activeProjectId&&chosen&&!saveActiveProject())return false;
  try{
  const now=new Date().toISOString();const project=createPersonaProject({id:newProjectId(),title:idea.title,contentType:idea.format,sourceIdea:idea.angle,now});const collection=savePersonaProject(localStorage,project,project.id);
  lastOwnSavedRevision.current={id:project.id,revision:project.revision};
  setProjects(collection.projects);setActiveProjectId(project.id);setTimeline(null);setChosen({...idea,id:project.id});setDraft(null);setQa(null);setProduction(null);setScenarioWorkspace(undefined);setLocalRenderReview(null);setColorComparison(null);setAiMediaJob(null);setProductionEditor('');setProductionComment('');setProductionFactsChecked(false);setWorkspaceStep(idea.format==='photo'||idea.format==='carousel'?'assets':idea.format==='reel'?'idea':'guide');setStage(idea.format==='photo'?'needs_assets':'strategy');setStatus('Новый проект создан и сохранён локально.');setShowBank(false);resetLocalAsset();setMediaProbe(null);
  return true;
  }catch{setSaveState('error');setStatus('Создание проекта не удалось: браузер не подтвердил сохранение. Текущий проект сохранён.');return false}
 }
 function openProject(project:PersonaProject){
  if(!canLeaveGuide())return false;
  if(activeProjectId&&chosen&&!saveActiveProject())return false;
  try{
  const collection=selectPersonaProject(localStorage,project.id);
  const saved=selectedPersonaProjectSnapshot(collection,project.id);
  lastOwnSavedRevision.current={id:saved.id,revision:saved.revision};
  setProjects(collection.projects);setActiveProjectId(saved.id);setTimeline(saved.timeline as PersonaTimelineSettings|null);setChosen(projectIdea(saved));setDraft(saved.script as Draft|null);setQa(saved.qa as QA|null);setProduction(reconcilePersonaProductionWithScenario(saved.shootingPlan as PersonaProductionPipeline|null,saved.scenarioWorkspace));setScenarioWorkspace(saved.scenarioWorkspace);setLocalRenderReview(readPersonaLocalRenderRecord(saved.processing));setColorComparison(readPersonaColorComparisonRecord(saved.colorComparison));setAiMediaJob(readPersonaAiMediaJob(saved.aiMediaJob));setWorkspaceStep(workspaceStepFrom(saved.lastOpenStep,saved.contentType));setStage(
    reconcilePersonaProductionWithScenario(saved.shootingPlan as PersonaProductionPipeline|null,saved.scenarioWorkspace)!==(saved.shootingPlan as PersonaProductionPipeline|null)
     ?'final_qa':projectStage(saved.stage));setProductionEditor('');setProductionComment('');setProductionFactsChecked(false);resetLocalAsset();setMediaProbe(saved.mediaAssets[0] as MediaProbe|null);setStatus('Проект восстановлен из актуального локального снимка. Исходные File не сохраняются в браузере без отдельной загрузки в облако.');setShowBank(false);
  return true;
  }catch{setSaveState('error');setStatus('Переключение проекта остановлено: браузер не подтвердил сохранение.');return false}
 }
 function startNewProject(){
  if(!canLeaveGuide())return false;
  if(activeProjectId&&chosen&&!saveActiveProject())return false;
  try{
  const collection=selectPersonaProject(localStorage,null);lastOwnSavedRevision.current=null;setProjects(collection.projects);setActiveProjectId(null);setTimeline(null);setChosen(null);setDraft(null);setQa(null);setProduction(null);setScenarioWorkspace(undefined);setLocalRenderReview(null);setColorComparison(null);setAiMediaJob(null);setProductionEditor('');setProductionComment('');setProductionFactsChecked(false);setStage('strategy');resetLocalAsset();setMediaProbe(null);setStatus('Выберите формат или идею для нового проекта. Существующие проекты сохранены.');
  return true;
  }catch{setSaveState('error');setStatus('Новый проект не открыт: браузер не подтвердил сохранение.');return false}
 }
 function navigate(next:PersonaScreen){if(next!==screen&&!canLeaveGuide())return;const hash=next==='home'?'#persona':next==='projects'?'#persona/projects':`#persona/project/${activeProjectId??''}`;if(location.hash!==hash)location.hash=hash;else setScreen(next)}
 function createQuickProject(format:PersonaContentType){const labels:Record<PersonaContentType,string>={reel:'Новый Reels',short:'Новый Shorts',story:'Новая история',photo:'Новое фото',carousel:'Новая карусель'};if(select({id:newProjectId(),title:labels[format],angle:'Создать материал из собственных исходников',format,score:0,source:'quick-start'}))window.setTimeout(()=>navigate('project'),0)}
 function continueProject(project:PersonaProject){if(openProject(project))window.setTimeout(()=>navigate('project'),0)}
 function startPilotShoot(){
  const saved=projects.find(project=>project.contentType==='reel'&&
   isActorComposerPilot({title:project.title,angle:project.sourceIdea}));
  if(saved){
   if(openProject(saved)){
    setWorkspaceStep('guide');
    window.setTimeout(()=>{window.location.hash='#persona/project/'+saved.id},0);
   }
   return;
  }
  const id=newProjectId();
  if(select({id,title:actorComposerPilot.title,angle:actorComposerPilot.angle,
    format:'reel',score:0,source:'editorial-pilot'})){
   // Preserve the shoot-first pilot; normal Reels begin at Idea.
   setWorkspaceStep('guide');
   window.setTimeout(()=>{window.location.hash='#persona/project/'+id},0);
  }
 }

 function persistGuide(guide:ProductionGuide){
  if(!activeProjectId||!chosen)throw new Error('Сначала откройте проект');
  const previous=scenarioWorkspace??{version:1 as const,research:[],analyses:[],ideas:[]};
  persistScenarioWorkspace({...previous,preProductionGuide:guide});
 }
 /** The only route from the editable guide into the authoritative Production Brief:
  * explicit user click, current script identity, structural QA and revoked approval. */
 function transferGuideToBrief(guide:ProductionGuide){
  if(!activeProjectId||!chosen||!production?.materials.productionBrief)
   throw new Error('Сначала создайте Production Brief в этом проекте.');
  if(guideDirty.current)throw new Error('Сначала сохраните изменения съёмочного плана.');
  if(personaScenarioDraftExists(localStorage,activeProjectId)||
   productionInputDraftExists(localStorage,activeProjectId))
   throw new Error('Есть незавершённый черновик сценария или брифа. Сначала сохраните его.');
  const original=production.materials.productionBrief;
  if(!productionBriefMatchesBeats(original,scenarioWorkspace?.script?.currentRevision.beats))
   throw new Error('Сценарий уже изменился: пересоберите Production Brief перед переносом съёмочных решений.');
  const revised=applyPersonaGuideToBrief(guide,original);
  if(JSON.stringify(original)===JSON.stringify(revised))return;
  const next=revisePersonaProductionBrief(production,revised);
  persistProductionMilestone(next,{stage:'final_qa'});
  setProductionEditor('');setProductionComment('');setProductionFactsChecked(false);
  setStatus('Съёмочные решения перенесены в Production Brief. Предыдущее утверждение сброшено; проверьте новую QA и утвердите бриф отдельно.');
 }
 function applyGuideExample(guide:ProductionGuide){
  if(!activeProjectId||!chosen||chosen.format!=='reel'||!isActorComposerPilot(chosen))throw new Error('Пример доступен только для специально выбранного проекта «Актёр и композитор».');
  if(production||scenarioWorkspace?.script||draft)throw new Error('В проекте уже есть сценарий или съёмочный бриф. Пример не заменяет существующую редакцию.');
  if(personaScenarioDraftExists(localStorage,activeProjectId)||productionInputDraftExists(localStorage,activeProjectId))
   throw new Error('В проекте есть незавершённая правка. Пример не перезапишет её.');
  const idea={id:chosen.id,title:chosen.title,angle:chosen.angle,format:'reel' as const};
  const brief=createActorComposerWorkingBrief(idea,guide);
  const next=importPersonaProductionBrief({brief,selectedIdea:idea});
  const base=scenarioWorkspace??{version:1 as const,research:[],analyses:[],ideas:[]};
  const now=new Date().toISOString();
  const transferredGuide=migrateActorComposerShotNotes(guide,brief,now);
  const updated=addImportedBriefScenario({...base,preProductionGuide:transferredGuide},brief,now);
  persistScenarioWorkspace(updated,chosen,next);
  setProduction(next);setQa(null);setProductionFactsChecked(false);
  setProductionEditor('');setProductionComment('');
  setWorkspaceStep('script');setStage('final_qa');
  setStatus('Семь сцен сохранены как НЕУТВЕРЖДЁННЫЙ сценарий. Проверьте реплики, свет, кадры и факты перед редакторским решением.');
 }
 async function generateShootWithAi(variation:'unexpected'|'humor'|'cinematic'|'intimate'){
  if(!chosen||!activeProjectId||directorWorking)return;
  if(!['reel','short','story'].includes(chosen.format)){
   setStatus('Нейросетевой режиссёр поддерживает пока только короткие видео.');return;
  }
  if(production||scenarioWorkspace?.script||draft){
   setStatus('В этом проекте уже есть сценарий. Для новой независимой идеи создайте отдельный проект; прежние версии не перезаписываем.');return;
  }
  const projectId=activeProjectId,idea=chosen;
  try{
   const before=loadPersonaProjects(localStorage,newProjectId);
   const initial=before.projects.find(item=>item.id===projectId);
   if(!initial)throw Error('Исходный проект не найден.');
   assertPersonaAsyncImportTarget(before,projectId,initial.revision);
   if(personaScenarioDraftExists(localStorage,projectId)||productionInputDraftExists(localStorage,projectId))
    throw Error('Сначала сохраните незавершённый черновик проекта.');
   setDirectorWorking(true);
   setStatus('Запрашиваю реальную нейросеть. Без успешного ответа модельного провайдера сценарий не появится.');
   const previousHooks=read<string[]>('persona:director-hooks:v1',[]);
   const response=await fetch('/api/persona-director',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({idea:{id:idea.id,title:idea.title,angle:idea.angle,format:idea.format},
     variation,history:[...h.map(item=>item.title),...previousHooks].slice(-12),
     creativePreferences:{
      priorities:(scenarioWorkspace?.creativeProfile?.priorities??[]).slice(0,5).map(v=>v.slice(0,180)),
      constraints:(scenarioWorkspace?.creativeProfile?.constraints??[]).slice(0,5).map(v=>v.slice(0,180)),
     },
     avoidFailures:(scenarioWorkspace?.editorialFeedback??[]).slice(-4).map(v=>v.comment.slice(0,180)),
     seed:newProjectId()}),
   });
   const raw:unknown=await response.json().catch(()=>null);
   if(!response.ok)throw Error(typeof raw==='object'&&raw!==null&&'error' in raw?
    String((raw as {error:unknown}).error):'director_unavailable');
   const proposal=readPersonaDirectorProposal(raw,idea.id);
   if(!proposal)throw Error('Нейросеть вернула недостоверную или неполную раскадровку.');
   assertPersonaAsyncImportTarget(loadPersonaProjects(localStorage,newProjectId),projectId,initial.revision);
   if(personaScenarioDraftExists(localStorage,projectId)||productionInputDraftExists(localStorage,projectId))
    throw Error('За время генерации появился несохранённый черновик. Импорт отменён.');
   const newIdea={...idea,title:proposal.title};
   const brief=personaDirectorToBrief(
    {id:newIdea.id,title:newIdea.title,angle:newIdea.angle,format:newIdea.format},proposal);
   const pipeline=importPersonaProductionBrief({
    brief,selectedIdea:{id:newIdea.id,title:newIdea.title,angle:newIdea.angle,format:newIdea.format},
   });
   const base=scenarioWorkspace??{version:1 as const,research:[],analyses:[],ideas:[]};
   const now=new Date().toISOString();
   const guide=base.preProductionGuide??
    createPersonaProductionGuide(now,isActorComposerPilot(idea)?'actor_composer':'general');
   let aiGuide:ProductionGuide={
    ...guide,fields:base.preProductionGuide?guide.fields:{
     ...guide.fields,location:proposal.setup.location,camera:proposal.setup.camera,
     keyLight:proposal.setup.lighting,sound:proposal.setup.sound,
     wardrobeProps:proposal.setup.wardrobe,setArrangement:proposal.setup.arrangement,
     editing:proposal.editingIntent,color:proposal.colorIntent,
    },
   };
   for(const [i,scene] of proposal.scenes.entries()){
    aiGuide=updateGuideShotNote(aiGuide,{
     id:String(i+1),seconds:scene.durationSec,line:scene.line.trim(),action:scene.action.trim(),
    },{camera:scene.camera,lighting:scene.lighting,
     performance:scene.performance,edit:scene.edit},now);
   }
   const next=addImportedBriefScenario({...base,preProductionGuide:aiGuide},brief,now);
   if(!next.script?.currentRevisionId)throw Error('Нельзя сохранить происхождение ИИ-сценария без версии.');
   const generatedWorkspace:ScenarioWorkspace={...next,directorGeneration:{
    version:1,provider:proposal.provider,model:proposal.model,variation,
    revisionId:next.script.currentRevisionId,createdAt:proposal.createdAt,
   }};
   persistScenarioWorkspace(generatedWorkspace,newIdea,pipeline);
   setChosen(newIdea);setProduction(pipeline);setDraft(null);setQa(null);
   setProductionFactsChecked(false);setWorkspaceStep('guide');setStage('final_qa');
   save('persona:director-hooks:v1',[...previousHooks,proposal.hook,proposal.scenes[0].line].slice(-12));
   setStatus('Реальная модель '+proposal.model+' создала '+proposal.scenes.length+
    ' новых кадров. Реплики и режиссёрские указания сохранены как НЕУТВЕРЖДЁННЫЙ сценарий. Монтаж и съёмка не выполнены.');
  }catch(error){
   const code=String((error as Error)?.message||'director_unavailable');
   setStatus(code==='director_model_not_configured'
    ?'Реальная нейросеть не подключена. Для Windows настройте локальный Ollama в Persona Director; шаблон вместо неё не выдаётся.'
    :code==='director_ollama_unavailable'
    ?'Ollama не ответила. Проверьте, запущена ли локальная модель; сценарий не создан.'
    :'Нейросетевой сценарий не создан: '+code);
  }finally{setDirectorWorking(false)}
 }
 function createProductionBrief(idea=chosen,angle?:string){
  if(!idea)return;
  try{
   if(activeProjectId&&productionInputDraftExists(resolvePersonaScenarioDraftStorage(),activeProjectId))
    throw Error('Сначала сохраните или разрешите незавершённую правку брифа.');
   const next=buildPersonaProductionWorkflow({...idea,angle:angle??idea.angle});
   persistProductionMilestone(next);
   setProductionEditor('');setProductionComment('');setProductionFactsChecked(false);
   setStatus('Съёмочный бриф создан и сохранён. Проверь свободные утверждения перед одобрением.');
  }catch(error){setStatus('Бриф не сохранён: '+String((error as Error).message||error))}
 }
 function createScenarioProductionBrief(brief:PersonaProductionBrief){
  if(!chosen)return;
  try{
   if(activeProjectId&&productionInputDraftExists(resolvePersonaScenarioDraftStorage(),activeProjectId))
    throw Error('Есть несохранённый ввод в прежнем съёмочном брифе. Сначала сохраните или разрешите черновик.');
   const next=importPersonaProductionBrief({brief,selectedIdea:{id:chosen.id,title:chosen.title,angle:chosen.angle,format:chosen.format}});
   persistProductionMilestone(next,{stage:'final_qa',step:'review',resetQa:true});
   setProductionEditor('');setProductionComment('');setProductionFactsChecked(false);
   setStatus('Утверждённый сценарий перенесён в сохранённый съёмочный бриф. Редакторская проверка брифа остаётся отдельной.');
  }catch(error){setStatus('Передача сценария отклонена: '+String((error as Error).message||error))}
 }
 async function importProductionBrief(file:File|undefined){
  if(!file||!chosen)return;
  try{
   if(!activeProjectId)throw new Error('Сначала откройте проект для импорта съёмочного брифа.');
   const importingProjectId=activeProjectId;
   const initial=loadPersonaProjects(localStorage,newProjectId);
   const initialProject=initial.projects.find(project=>project.id===importingProjectId);
   if(!initialProject)throw new Error('Исходный проект не найден. Импорт отменён.');
   assertPersonaAsyncImportTarget(initial,importingProjectId,initialProject.revision);
   if(personaScenarioDraftExists(localStorage,importingProjectId)||productionInputDraftExists(localStorage,importingProjectId))
    throw new Error('В этом проекте есть несохранённый черновик. Сначала сохраните или разрешите его на этапе «Сценарий».');
   const decoded=JSON.parse(await file.text());
   assertPersonaAsyncImportTarget(loadPersonaProjects(localStorage,newProjectId),importingProjectId,initialProject.revision);
   if(personaScenarioDraftExists(localStorage,importingProjectId)||productionInputDraftExists(localStorage,importingProjectId))
    throw new Error('Во время чтения файла появился несохранённый черновик. Импорт отменён.');
   const importedIdea=ideaForImportedBrief(chosen,decoded,!scenarioWorkspace&&!production&&!draft&&!mediaProbe&&chosen.source==='quick-start');
   const next=importPersonaProductionBrief({brief:decoded,selectedIdea:{id:importedIdea.id,title:importedIdea.title,angle:importedIdea.angle,format:importedIdea.format}});
   const importedBrief=next.materials.productionBrief;
   if(!importedBrief)throw new Error('Съёмочный бриф отсутствует после проверки.');
   const updatedWorkspace=addImportedBriefScenario(scenarioWorkspace,importedBrief,new Date().toISOString());
   persistScenarioWorkspace(updatedWorkspace,importedIdea,next);
   if(importedIdea!==chosen)setChosen(importedIdea);
   setQa(null);setProduction(next);setProductionEditor('');setProductionComment('');setProductionFactsChecked(false);setWorkspaceStep('script');setStage('final_qa');
   setStatus(`Импортирован съёмочный бриф: ${next.materials.shotList?.length||0} кадров. Кандидат сохранён в истории сценария без авторского утверждения.`);
  }catch(error){setStatus(`Импорт не выполнен: ${String((error as Error).message||'некорректный JSON')}`)}
 }
 function reviseProductionBrief(brief:PersonaProductionBrief):boolean{
  if(!production)return false;
  try{
   const next=revisePersonaProductionBrief(production,brief);
   persistProductionMilestone(next,{stage:'final_qa'});
   setProductionEditor('');setProductionComment('');setProductionFactsChecked(false);
   setStatus('Правка сохранена. Предыдущее утверждение сброшено, структурная проверка выполнена повторно.');
   return true;
  }catch(error){setStatus(`Правка не сохранена: ${String((error as Error).message||'некорректный бриф')}`);return false}
 }
 function decideProduction(decision:'approved'|'rejected'){
  if(!production)return;
  try{
   if(activeProjectId&&productionInputDraftExists(resolvePersonaScenarioDraftStorage(),activeProjectId))
    throw Error('Есть незавершённая правка съёмочного брифа. Сначала сохраните или разрешите её.');
   if(decision==='approved'&&production.materials.qa?.status==='needs_revision')throw new Error('Нельзя утвердить бриф с ошибками QA.');
   if(decision==='approved'&&!productionBriefMatchesBeats(production.materials.productionBrief,scenarioWorkspace?.script?.currentRevision.beats))throw new Error('Сценарий изменился после создания брифа. Сначала перенесите актуальные реплики и кадры в Production Brief.');
   if(decision==='approved'&&(production.input.idea.angle.trim()!==production.materials.productionBrief?.sourceAngle||production.input.idea.title.trim()!==production.materials.productionBrief?.sourceTitle||production.input.idea.format!==production.materials.productionBrief?.sourceFormat))throw new Error('Сценарий устарел: сначала обновите бриф после правки.');
   const next=recordPersonaEditorialDecision(production,{decision,editor:productionEditor,comment:productionComment,factReviewCompleted:productionFactsChecked,decidedAt:new Date().toISOString()});
   persistProductionMilestone(next);
   setStatus(decision==='approved'?'Бриф сохранён и одобрен для съёмки. Публикация и монтаж не выполнялись.':'Бриф сохранён и возвращён на доработку; сценарий, кадры и инструкции сохранены.');
  }catch(error){setStatus(String((error as Error).message||'Не удалось записать редакторское решение.'))}
 }
 function updateProductionAngle(angle:string){
  if(!production)return;
  try{
   const next={...production,stage:'QA' as const,input:{...production.input,idea:{...production.input.idea,angle}},statuses:{...production.statuses,QA:'needs_revision' as const,READY_FOR_SHOOT:'pending' as const}};
   persistProductionMilestone(next);
   setProductionFactsChecked(false);
   setStatus('Идея изменена и сохранена. Обновите бриф, прежде чем утверждать съёмку.');
  }catch(error){setStatus('Изменение идеи не сохранено: '+String((error as Error).message||error))}
 }
 async function generate(idea=chosen){if(!idea||working)return;setChosen(idea);setWorking(true);setStatus('Стратег → редактор → маркетолог → медиа QA → финальная самопроверка…');setStage('production');try{const data=await api({action:'generate',engine:useFreeAI?'free-ai':'template',idea,history:h,assetName});setDraft(data.draft);setQa(data.qa||null);setEngineMode(data.mode==='ai'?'ai':'template');setStage('final_qa');setStatus(data.mode==='ai'?`Настоящий ИИ (${data.model||'free'}) подготовил сценарий. Проверь факты, текст и съёмочный план.`:'Подготовлен демонстрационный шаблон без вызова ИИ. Видеомонтаж и обработка фото не выполнялись.')}catch(e){const code=String((e as Error)?.message||'недоступен');
    setStatus(code==='free_ai_gateway_access_denied'
      ? 'AI Gateway отказал в доступе этому проекту (403 access_denied). Это ограничение Vercel: новый ввод идеи не поможет. Проверь права AI Gateway у команды Vercel; платная модель не подключалась.'
      : code==='free_ai_account_verification_required'
        ? 'AI Gateway требует подтверждения аккаунта Vercel. Не покупай кредиты вслепую; прежде проверь требование в панели AI Gateway. Сценарий не создан.'
        : code==='free_ai_provider_403'
          ? 'AI Gateway вернул отказ 403 без уточнения причины. Сценарий не создан; проверь раздел AI Gateway в Vercel.'
          : 'Реальный ИИ не ответил: '+code+'. Шаблон не подставлен.');setStage('production')}finally{setWorking(false)}}
 async function revise(){if(!draft||!feedback.trim()||working)return;setWorking(true);setStatus('Понимаю всю команду целиком → редакция → маркетолог → QA…');try{const data=await api({action:'revise',engine:useFreeAI?'free-ai':'template',draft,feedback,history:h});setDraft(data.draft);setQa(data.qa||null);setEngineMode(data.mode==='ai'?'ai':'template');setStage('final_qa');setFeedback('');setStatus(data.mode==='ai'?'ИИ обновил текстовый черновик. Проверь изменения.':'Шаблонный редактор применил только поддерживаемые типовые правки; прочие пожелания могли не отразиться.')}catch(e){setStatus(String((e as Error)?.message||'Правку не удалось применить.'))}finally{setWorking(false)}}
 async function startRecording(){if(recording||transcribing)return;if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){setStatus('Запись недоступна в этом браузере. Напиши правку текстом.');return}try{const s=await navigator.mediaDevices.getUserMedia({audio:true});stream.current=s;chunks.current=[];const r=new MediaRecorder(s);rec.current=r;r.ondataavailable=e=>{if(e.data.size)chunks.current.push(e.data)};r.onstop=async()=>{s.getTracks().forEach(t=>t.stop());setRecording(false);const blob=new Blob(chunks.current,{type:r.mimeType||'audio/webm'});if(!blob.size)return;setTranscribing(true);setStatus('Запись закончена. Отправляю весь файл целиком на распознавание…');try{const form=new FormData();form.append('audio',blob,`voice-${Date.now()}.webm`);const response=await fetch('/api/persona',{method:'POST',body:form});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data?.error||'voice_unavailable');const text=String(data.transcript||'').trim();if(!text)throw new Error('empty_transcript');setFeedback(x=>[x.trim(),text].filter(Boolean).join(' '));setStatus('Полная запись распознана. Теперь нажми «Исправить» — команда ещё не применена.')}catch(e){setStatus(String((e as Error)?.message||'Голос не удалось распознать.'))}finally{setTranscribing(false)}};r.start();setRecording(true);setStatus('Запись идёт. Паузы её не остановят. Останови запись кнопкой ■.')}catch{setStatus('Нет доступа к микрофону. Разреши микрофон для сайта.')}}
 function stopRecording(){if(rec.current?.state==='recording')rec.current.stop()}
 function onAsset(e:React.ChangeEvent<HTMLInputElement>){const file=e.target.files?.[0];if(!file)return;const kind=file.type.startsWith('video/')?'video':file.type.startsWith('image/')?'image':null;if(!kind){setStatus('Неподдерживаемый тип файла. Выберите видео или изображение.');return}if(file.size>250*1024*1024){setStatus('Файл превышает лимит локального предпросмотра 250 МБ. Исходник не был открыт.');return}if(chosen?.format==='photo'&&kind!=='image'){setStatus('Для фото нужен исходник изображения.');return}const sequence=++mediaProbeSequence.current;const url=URL.createObjectURL(file);if(assetUrlRef.current)URL.revokeObjectURL(assetUrlRef.current);assetUrlRef.current=url;setAsset(url);setAssetName(file.name);setAssetIsVideo(kind==='video');setMediaProbe({name:file.name,bytes:file.size,mime:file.type,kind});setStage('production');setStatus('Исходник открыт локально. Измеряются только доступные браузеру параметры; монтаж и анализ художественного качества ещё не выполняются.');const element=kind==='video'?document.createElement('video'):document.createElement('img');const finish=()=>{if(sequence!==mediaProbeSequence.current)return;if(kind==='video'){const video=element as HTMLVideoElement;setMediaProbe({name:file.name,bytes:file.size,mime:file.type,kind,width:video.videoWidth,height:video.videoHeight,durationSec:Number.isFinite(video.duration)?video.duration:undefined})}else{const img=element as HTMLImageElement;setMediaProbe({name:file.name,bytes:file.size,mime:file.type,kind,width:img.naturalWidth,height:img.naturalHeight})}element.removeAttribute('src');if(kind==='video')(element as HTMLVideoElement).load()};element.addEventListener(kind==='video'?'loadedmetadata':'load',finish,{once:true});element.addEventListener('error',()=>{if(sequence!==mediaProbeSequence.current)return;setMediaProbe({name:file.name,bytes:file.size,mime:file.type,kind,error:'Браузер не смог прочитать метаданные.'})},{once:true});element.src=url;if(kind==='video')(element as HTMLVideoElement).preload='metadata';}
 function approve(){if(!draft||!qa?.pass)return;remember(chosen!,'used');setStage('approval');setStatus('Черновик одобрен на этом устройстве. Автоматической публикации не было.')}
 function rejectIdea(){if(chosen)remember(chosen,'rejected');setChosen(null);setDraft(null);setQa(null);setProduction(null);setStage('strategy')}
 const isReelMvp=chosen?.format==='reel';const projectSteps=isReelMvp?REEL_MVP_STEPS:workspaceStepsFor(chosen?.format);
  const workspaceIndex=isReelMvp?reelMvpIndex(workspaceStep):Math.max(0,projectSteps.findIndex(([id])=>id===workspaceStep));
 function moveWorkspace(direction:-1|1){const next=projectSteps[workspaceIndex+direction];if(next&&canLeaveGuide())setWorkspaceStep(next[0])}
 if(screen==='home')return <section className="personaFactoryV2 personaMobileHome"><header className="pfHead"><div><h2>Мастерская</h2><p>Создавайте и продолжайте материалы в одном месте.</p></div></header><section className="personaTodayShoot" aria-label="Что снять сегодня">
  <small>СЕГОДНЯ · 31 СЕКУНДА · 7 КАДРОВ</small>
  <h3>Сними короткую сцену: актёр + композитор</h3>
  <p><b>Первая реплика:</b> «Я актёр. И ещё пишу музыку.» Две роли, телефон на штативе, одна комната. Дальше — точные реплики, кадры, свет, игра и монтаж.</p>
  <button type="button" className="primary" onClick={startPilotShoot}>Показать 7 кадров и начать съёмку</button>
  <small>Рабочий пример, не утверждённая публикация. Старые проекты и сценарии сохраняются.</small>
 </section><div className="personaHomeActions"><button className="primary" onClick={()=>createQuickProject('reel')}>Создать Reels</button><button className="primary" onClick={startPilotShoot}>Открыть съёмку: актёр + композитор · 7 кадров</button><button onClick={()=>createQuickProject('photo')}>Обработать фото</button><button onClick={()=>createQuickProject('carousel')}>Создать карусель</button></div><section className="personaHomeContinue"><h3>Продолжить последний проект</h3>{projects.find(project=>project.id===activeProjectId)?<button className="projectCard" onClick={()=>continueProject(projects.find(project=>project.id===activeProjectId)!)}><b>{projects.find(project=>project.id===activeProjectId)!.title}</b><span>{contentTypeLabel(projects.find(project=>project.id===activeProjectId)!.contentType)} · {stageLabel(projectStage(projects.find(project=>project.id===activeProjectId)!.stage))}</span></button>:<button disabled>Продолжить последний проект</button>}<button className="ghost" onClick={()=>navigate('projects')}>Мои проекты</button></section><DataPortability/></section>;
 if(screen==='projects')return <section className="personaFactoryV2 personaProjectList"><header className="pfHead"><div><button className="backButton" onClick={()=>navigate('home')}>← Persona</button><h2>Мои проекты</h2><p>{projects.length?'Выберите материал, чтобы продолжить.':'Здесь появятся ваши материалы.'}</p></div><button className="primary" onClick={()=>navigate('home')}>Новый проект</button></header><div className="projectRows">{projects.map(project=><article key={project.id}><div><b>{project.title}</b><span>{contentTypeLabel(project.contentType)} · {stageLabel(projectStage(project.stage))} · сохранён {new Date(project.updatedAt).toLocaleDateString('ru-RU')}</span></div><button onClick={()=>continueProject(project)}>Открыть</button></article>)}</div></section>;
 return <section className="personaFactoryV2">
  <header className="pfHead personaProjectHead"><div><button className="backButton" onClick={()=>navigate('projects')}>← Мои проекты</button><h2>{chosen?.title||'Новый проект'}</h2><p>{contentTypeLabel(chosen?.format as PersonaContentType|undefined)} · {stageLabel(stage)} · {saveState==='saved'?'Сохранено на этом устройстве':saveState==='saving'?'Сохранение…':'Сохранение не удалось'}</p></div><button className="ghost" onClick={()=>navigate('home')}>Persona</button></header>
  {guideGuardMessage&&<p className="personaGuideNavigationWarning" role="alert">{guideGuardMessage}</p>}
  {isReelMvp?<PersonaMvpSteps step={workspaceStep} onSelect={next=>{if(canLeaveGuide())setWorkspaceStep(next)}}/>:
   <nav className="personaWorkspaceSteps" aria-label="Этапы производства">{projectSteps.map(([id,label],index)=><button key={id} type="button" className={workspaceStep===id?'current':''} onClick={()=>{if(canLeaveGuide())setWorkspaceStep(id)}} aria-current={workspaceStep===id?'step':undefined}><span>{index+1}</span>{label}</button>)}</nav>}
  {isReelMvp&&(workspaceStep==='guide'||workspaceStep==='assets')&&
   <div className="personaMvpSubsteps" role="group" aria-label="Съёмка и исходники">
    <button type="button" aria-pressed={workspaceStep==='guide'} onClick={()=>{if(canLeaveGuide())setWorkspaceStep('guide')}}>План съёмки</button>
    <button type="button" aria-pressed={workspaceStep==='assets'} onClick={()=>{if(canLeaveGuide())setWorkspaceStep('assets')}}>Добавить исходники</button>
   </div>}
  {isReelMvp&&(workspaceStep==='review'||workspaceStep==='export')&&
   <div className="personaMvpSubsteps" role="group" aria-label="Проверка и выпуск">
    <button type="button" aria-pressed={workspaceStep==='review'} onClick={()=>{if(canLeaveGuide())setWorkspaceStep('review')}}>Проверить результат</button>
    <button type="button" aria-pressed={workspaceStep==='export'} onClick={()=>{if(canLeaveGuide())setWorkspaceStep('export')}}>Скачать MP4</button>
   </div>}
  {!chosen&&<section className="personaQuickStart" aria-label="Быстрый старт Persona"><h3>Быстрый старт</h3><div className="personaQuickStartGrid">{(['reel','photo','carousel'] as const).map(format=><button key={format} type="button" onClick={()=>select({id:crypto.randomUUID(),title:format==='reel'?'Новый Reels':format==='photo'?'Новое фото':'Новая карусель',angle:'Создать материал из собственных исходников',format,score:0,source:'quick-start'})}>{format==='reel'?'Создать Reels':format==='photo'?'Обработать фото':'Создать карусель'}</button>)}</div><p>Экспорт MP4 с телефона пока не подключён.</p></section>}
  <details className="personaDeveloperDisclosure"><summary>Дополнительные инструменты</summary><PersonaCloudPanel/><PersonaEditorialCalendar onSelectSlot={slot=>{if(select({id:slot.slotId,title:slot.notes||slot.purpose,angle:slot.notes||slot.purpose,format:slot.format as Idea['format'],score:0,source:'editorial-calendar'}))window.setTimeout(()=>navigate('project'),0)}}/></details>
  {chosen&&<label className="briefImport"><span>Импортировать съёмочный бриф JSON</span><input type="file" accept=".json,application/json" aria-label="Импортировать съёмочный бриф JSON" onChange={e=>{void importProductionBrief(e.target.files?.[0]);e.target.value=''}}/><small>Файл проверяется до сохранения и не может перенести утверждение.</small></label>}
  {chosen&&status&&<p className="personaWorkspaceStatus" role="status">{status}</p>}
  {false&&<div className="pfTrialBanner">
    <b>Выбери двигатель сценария:</b>
    <label className="pfFreeAiToggle">
      <input type="checkbox" checked={useFreeAI} onChange={e=>setUseFreeAI(e.target.checked)}/>
      <span><strong>Настоящий ИИ (Nemotron Free)</strong> — бесплатная модель, количество запросов ограничено</span>
    </label>
    <span>{useFreeAI?'Идея, сценарий и текст правки передаются внешнему ИИ-провайдеру. Не вводи личные или секретные данные. Если модель недоступна, увидишь ошибку, не фальшивый сценарий.':'Локальный шаблон для теста интерфейса, без вызова модели. Можно включить настоящий ИИ выше.'}</span>
    <p>Фото/видео не изменяются и не загружаются на сервер. Автопубликация отключена.</p>
  </div>}
  {!chosen&&<>
   <div className="pfCustomIdea"><input aria-label="Своя идея" value={customIdea} onChange={e=>setCustomIdea(e.target.value)} placeholder="Напиши свою идею для ролика или карусели…"/><select aria-label="Формат" value={customFormat} onChange={e=>setCustomFormat(e.target.value as 'reel'|'carousel')}><option value="reel">Рилс</option><option value="carousel">Карусель</option></select><button disabled={!customIdea.trim()} onClick={()=>select(buildCustomPersonaIdea(customIdea,customFormat))}>Создать</button></div>
   {visibleIdeas[0]&&<div className="todayIdea"><small>ЛОКАЛЬНЫЙ ПРИОРИТЕТ · {visibleIdeas[0].score}/100</small><h3>{visibleIdeas[0].title}</h3><p>{visibleIdeas[0].angle}</p><div className="ideaReason">Почему сейчас: {visibleIdeas[0].reason||'баланс интереса, процесса и личного голоса.'}</div><div className="actions"><button className="primary" disabled={working} onClick={()=>void generate(visibleIdeas[0])}>{working?'Собираю…':'Собрать материал'}</button><button className="ghost" onClick={()=>setShowBank(v=>!v)}>{showBank?'Скрыть банк':`Посмотреть банк · ${visibleIdeas.length}`}</button></div></div>}
   {showBank&&<div className="ideaBank"><div className="bankTop"><b>Банк идей</b><span>Использованные и отклонённые темы сюда не возвращаются.</span></div>{visibleIdeas.map((idea,i)=><article className="ideaRow" key={idea.id}><button className="ideaSelect" onClick={()=>select(idea)}><small>{String(i+1).padStart(2,'0')} · {idea.format.toUpperCase()} · {idea.score}/100</small><strong>{idea.title}</strong><span>{idea.angle}</span></button><button className="later" onClick={()=>remember(idea,'later')}>На потом</button><button className="reject" onClick={()=>remember(idea,'rejected')}>Неинтересно</button></article>)}</div>}
  </>}
  {chosen&&activeProjectId&&workspaceStep==='guide'&&(['reel','short','story'] as const).includes(chosen.format as 'reel'|'short'|'story')&&
   <PersonaShootNow key={'shoot-now:'+activeProjectId} projectId={activeProjectId}
    plan={buildPersonaShootPlan({title:chosen.title,workspace:scenarioWorkspace,pipeline:production,
     allowPilot:chosen.format==='reel'&&isActorComposerPilot(chosen)})}
    onOpenScript={()=>setWorkspaceStep('script')}
    onOpenEdit={()=>setWorkspaceStep('edit')}
    onSavePilot={chosen.format==='reel'&&isActorComposerPilot(chosen)&&!production&&!scenarioWorkspace?.script&&!draft
     ?()=>applyGuideExample(scenarioWorkspace?.preProductionGuide??createPersonaProductionGuide(new Date().toISOString(),'actor_composer')):undefined}
    onGenerateAi={!production&&!scenarioWorkspace?.script&&!draft?variation=>{void generateShootWithAi(variation)}:undefined}
    aiBusy={directorWorking}
    generation={scenarioWorkspace?.directorGeneration}
    generationCurrent={Boolean(scenarioWorkspace?.directorGeneration&&
     scenarioWorkspace.directorGeneration.revisionId===scenarioWorkspace.script?.currentRevisionId)}/>}
  {chosen&&activeProjectId&&workspaceStep==='guide'&&(['reel','short','story'] as const).includes(chosen.format as 'reel'|'short'|'story')&&<PersonaProductionGuide key={`production-guide:${activeProjectId}`}
   projectTitle={chosen.title} projectAngle={chosen.angle} allowExample={chosen.format==='reel'&&!draft&&isActorComposerPilot(chosen)} workspace={scenarioWorkspace}
   pipeline={production} onSave={persistGuide} onApplyToBrief={transferGuideToBrief} onDirtyChange={dirty=>{guideDirty.current=dirty;if(!dirty)setGuideGuardMessage('')}} onUseExample={applyGuideExample}
   onNavigate={setWorkspaceStep}/>}
  {chosen&&(workspaceStep==='assets'||(!draft&&workspaceStep==='idea'))&&<div className="captureCard"><small>{chosen.source==='user'?'СОБСТВЕННАЯ ИДЕЯ':chosen.source==='project'?'СОХРАНЁННЫЙ ПРОЕКТ':contentTypeLabel(chosen.format)}</small><h3>{chosen.title}</h3><p>{chosen.angle}</p>{workspaceStep==='assets'&&chosen.format!=='carousel'&&<label className="assetDrop">{asset?(assetIsVideo?<video src={asset} controls preload="metadata" style={{width:'100%',maxHeight:280}}/>:<img src={asset} alt="Исходник"/>):<><b>Добавь исходник</b><span>Файл остаётся в браузере и не отправляется на сервер.</span></>}<input type="file" accept={chosen.format==='photo'?'image/*':'video/*,image/*'} onChange={onAsset}/></label>}<div className="actions"><button className="ghost" onClick={()=>{setChosen(null);setStage('strategy')}}>Другая идея</button><button className="ghost" onClick={()=>createProductionBrief()}>Создать съёмочный бриф</button><button className="primary" disabled={working} onClick={()=>void generate()}>{working?'Собираю…':chosen.format==='carousel'?'Подготовить карусель':'Подготовить сценарий'}</button></div>{mediaProbe&&<div className="status" aria-label="Параметры исходника"><b>Файл:</b> {mediaProbe.name} · {(mediaProbe.bytes/1024/1024).toFixed(2)} МБ · {mediaProbe.mime||'тип неизвестен'}{mediaProbe.width&&mediaProbe.height?` · ${mediaProbe.width}×${mediaProbe.height}`:''}{mediaProbe.durationSec!==undefined?` · ${mediaProbe.durationSec.toFixed(1)} сек.`:''}{mediaProbe.error?` · ${mediaProbe.error}`:''}<p>FPS, качество звука, цвет и содержание пока не измерены. Исходник не загружен на сервер.</p></div>}{status&&<div className="status">{status}</div>}</div>}
  {chosen&&activeProjectId&&workspaceStep==='script'&&<PersonaScenarioWorkspace key={`scenario-workspace:${personaScenarioWorkspaceMountKey(activeProjectId,scenarioWorkspace)}`} project={projects.find(project=>project.id===activeProjectId)??createPersonaProject({id:activeProjectId,title:chosen.title,contentType:chosen.format as PersonaContentType,sourceIdea:chosen.angle,now:new Date().toISOString()})} workspace={scenarioWorkspace} creativeProfile={{priorities:['смысловые склейки','естественный голос','актёрские паузы'],constraints:['не менять внешность','не выдавать метаданные за просмотр','не копировать чужой сценарий']}} onChange={persistScenarioWorkspace} onCreateBrief={input=>createScenarioProductionBrief(input)}/>}
  {chosen?.format==='photo'&&workspaceStep==='edit'&&<PersonaPhotoEditor/>}
  {chosen?.format==='carousel'&&workspaceStep==='edit'&&<PersonaCarouselEditor key={chosen.id} title={chosen.title} initialSlides={draft?.slides}/>}
  {chosen&&workspaceStep==='edit'&&(['reel','short','story'] as const).includes(chosen.format as 'reel'|'short'|'story')&&<PersonaVideoTimeline key={`video-timeline:${activeProjectId??chosen.id}`} projectId={activeProjectId??chosen.id} initialTimeline={timeline} onTimelineChange={setTimeline}/>}
  {production&&(workspaceStep==='script'||workspaceStep==='review')&&<PersonaProductionBriefPanel key={`production-brief:${activeProjectId??'legacy'}`} projectId={activeProjectId??'legacy'} pipeline={production} editor={productionEditor} comment={productionComment} factsChecked={productionFactsChecked} onEditorChange={setProductionEditor} onCommentChange={setProductionComment} onFactsCheckedChange={setProductionFactsChecked} onDecision={decideProduction} onRebuild={()=>createProductionBrief(chosen,production.input.idea.angle)} onAngleChange={updateProductionAngle} onBriefChange={reviseProductionBrief}/>}
  {production&&chosen?.format==='reel'&&activeProjectId&&(workspaceStep==='edit'||workspaceStep==='review')&&<PersonaAiMediaWorker key={activeProjectId+JSON.stringify(production.materials.productionBrief)} projectId={activeProjectId} pipeline={production} hasUnsavedDraft={productionInputDraftExists(localStorage,activeProjectId)} record={aiMediaJob} onSave={persistAiMediaJob}/>}
  {chosen?.format==='reel'&&activeProjectId&&(workspaceStep==='edit'||workspaceStep==='review')&&projects.some(project=>project.id===activeProjectId&&project.colorComparison!==undefined&&!readPersonaColorComparisonRecord(project.colorComparison))&&<p role="alert" className="personaComparisonWarning">Запись цветовой обработки повреждена. Остальные проекты доступны, исходные данные сохранены. Перед новым импортом восстановите или сохраните резервную копию.</p>}
   {chosen?.format==='reel'&&activeProjectId&&(workspaceStep==='edit'||workspaceStep==='review')&&<PersonaColorComparisonStudio key={'color-comparison:'+activeProjectId} projectId={activeProjectId} record={colorComparison} onSave={persistColorComparison}/>}
  {chosen?.format==='reel'&&activeProjectId&&(workspaceStep==='review'||workspaceStep==='export')&&<PersonaLocalRenderReview key={`local-render-review:${activeProjectId}`} projectId={activeProjectId} pipeline={reconcilePersonaProductionWithScenario(production,scenarioWorkspace)} record={localRenderReview} onSave={persistLocalRenderReview}/>}
  {chosen&&draft&&workspaceStep==='review'&&<div className={`draft ${styleClass(draft.style)}`}><div className="draftTop"><div><small>{engineMode==='ai'?'Сценарий реального ИИ':'Шаблонный черновик'} · Формальная проверка {qa?.score||0}/100</small><h3>{draft.title}</h3></div><span className={qa?.pass?'qaPass':'qaFail'}>{qa?.pass?'Форма проверена':'Есть замечания'}</span></div>{asset&&(assetIsVideo?<video className="assetPreview" src={asset} controls preload="metadata"/>:<img className="assetPreview" src={asset} alt="Исходник"/>)}<div className="slides">{draft.slides.map((s,i)=><article key={i} className="slide"><small>{s.eyebrow}</small><strong>{s.title}</strong><p>{s.body}</p><span>{i+1}/{draft.slides.length}</span></article>)}</div><div className="caption"><small>ТЕКСТ</small><p>{draft.caption}</p></div>{draft.assetInstruction&&<div className="caption"><small>ПЛАН СЪЁМКИ И МОНТАЖА (ИНСТРУКЦИЯ, НЕ ВЫПОЛНЕННЫЙ МОНТАЖ)</small><p>{draft.assetInstruction}</p></div>}<div className="feedback"><textarea value={feedback} onChange={e=>setFeedback(e.target.value)} placeholder="Говори или пиши обычным языком. Можно дать длинную команду из нескольких требований."/><button className={recording?'mic listening':'mic'} disabled={transcribing} onClick={recording?stopRecording:startRecording}>{transcribing?'…':recording?'■':'🎙️'}</button></div><div className="voiceHint">{recording?'Запись идёт до твоего нажатия. Паузы не останавливают её.':transcribing?'Распознаю весь файл целиком…':'🎙️ → говори сколько нужно → ■. Только после ■ начинается распознавание.'}</div>{status&&<div className="status">{status}</div>}<div className="actions"><button className="ghost" onClick={()=>createProductionBrief()}>Создать съёмочный бриф</button><button className="ghost" disabled={!feedback.trim()||working||recording||transcribing} onClick={()=>void revise()}>{working?'Редактирую + проверяю…':'Исправить и проверить'}</button><button className="dangerGhost" onClick={rejectIdea}>Не публиковать</button><button className="primary" disabled={!qa?.pass||working} onClick={approve}>Утверждаю</button></div></div>}
  {chosen&&workspaceStep==='export'&&<section className="personaEmptyStage"><h3>Экспорт</h3><p>{chosen.format==='reel'?'Если финальный MP4 проверен и утверждён, кнопка «Скачать утверждённый MP4» находится выше в блоке «Финишный Reels». Для скачивания после перезагрузки повторно выбери тот же видеофайл и отчёты: браузер не хранит сами медиафайлы. Это не публикация.':'Для этого формата экспорт MP4 на данном экране не подключён.'}</p></section>}
  {chosen&&<nav className="personaWorkspaceFooter" aria-label="Переход между этапами"><button type="button" className="ghost" disabled={workspaceIndex===0} onClick={()=>moveWorkspace(-1)}>Назад</button><span>{projectSteps[workspaceIndex][1]}</span><button type="button" className="primary" disabled={workspaceIndex===projectSteps.length-1} onClick={()=>moveWorkspace(1)}>Продолжить</button></nav>}
 </section>
}
