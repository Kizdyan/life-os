import React, {useEffect,useRef,useState} from 'react';
import type {PersonaProductionPipeline} from '../../../packages/core/src/persona-production-pipeline';
import type {PersonaScenarioWorkspace} from './personaProjectStore';
import {
 createPersonaProductionGuide,exampleActorComposerBeats,actorComposerShotDirections,exampleActorComposerSourceFiles,exportPersonaShootingSheet,guideChecks,guideFieldLabels,guideProgress,productionGuideScenes,reviseGuideField,getPersonaGuideReadiness,guideShotNoteForScene,updateGuideShotNote,applyPersonaGuideToBrief,type GuideShotField,
 type PersonaProductionGuide,type GuideField,
} from './personaProductionGuide';
import './persona-production-guide.css';

type Props={
 projectTitle:string;
 projectAngle:string;
 allowExample:boolean;
 workspace?:PersonaScenarioWorkspace;
 pipeline:PersonaProductionPipeline|null;
 onSave:(guide:PersonaProductionGuide)=>void;
 onApplyToBrief?:(guide:PersonaProductionGuide)=>void;
 /** Synchronous signal for host navigation guard when a browser save fails. */
 onDirtyChange?:(dirty:boolean)=>void;
 onUseExample:(guide:PersonaProductionGuide)=>void;
 onNavigate:(step:'script'|'assets'|'edit'|'review')=>void;
};
const sections:{
 id:string;title:string;intro:string;fields:GuideField[];
}[]=[
 {id:'idea',title:'Идея и актуальность',intro:'Сначала решаем, кому и зачем нужен ролик. Популярность не подтверждается одним красивым референсом.',fields:['audience','viewerPromise','topicEvidence']},
 {id:'filming',title:'Где и как снимаем',intro:'Это конкретные стартовые предложения. Проверь помещение, свет и технику в реальности.',fields:['location','setArrangement','camera','keyLight','wardrobeProps','sound']},
 {id:'post',title:'Предварительный монтаж',intro:'Распиши сборку ДО съёмки, чтобы получить нужные реакции, паузы и детали.',fields:['editing','captions','color','safetyNotes']},
];
export function PersonaProductionGuide({projectTitle,projectAngle,allowExample,workspace,pipeline,onSave,onApplyToBrief,onDirtyChange,onUseExample,onNavigate}:Props){
 const stored=workspace?.preProductionGuide;
 const [draftPlan,setDraftPlan]=useState<PersonaProductionGuide>(()=>stored??createPersonaProductionGuide(new Date().toISOString(),allowExample?'actor_composer':'general'));
 const [unsaved,setUnsaved]=useState(false);
 const draftRef=useRef(draftPlan);
 const plan=unsaved?draftPlan:stored??draftPlan;
 const [notice,setNotice]=useState('');
 useEffect(()=>{
  if(!unsaved&&stored){draftRef.current=stored;setDraftPlan(stored)}
 },[stored,unsaved]);
 useEffect(()=>{
  if(!unsaved)return;
  const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
  window.addEventListener('beforeunload',warn);
  return ()=>window.removeEventListener('beforeunload',warn);
 },[unsaved]);
 const brief=pipeline?.materials.productionBrief??null;
 const briefMismatchFields=brief?[
  ...(brief.capture.location!==plan.fields.location?['Локация']:[]),
  ...(brief.capture.lighting!==plan.fields.keyLight?['Свет']:[]),
  ...(brief.capture.wardrobe!==plan.fields.wardrobeProps?['Костюм и реквизит']:[]),
  ...(brief.capture.audio.recording!==plan.fields.sound?['Звук']:[]),
  ...(brief.postProduction.transitions!==plan.fields.editing?['Склейки']:[]),
  ...(brief.postProduction.subtitles.instruction!==plan.fields.captions?['Титры']:[]),
  ...(brief.postProduction.color!==plan.fields.color?['Цвет']:[]),
 ]:[];
 const script=workspace?.script;
 const approvedScript=Boolean(script?.approval&&script.approval.revisionId===script.currentRevisionId);
 const scriptBeats=script?.currentRevision.beats;
 const scriptDiffersFromBrief=Boolean(brief&&scriptBeats&&
  (brief.script.length!==scriptBeats.length||scriptBeats.some((beat,i)=>
   beat.line!==brief.script[i]?.line||beat.action!==brief.script[i]?.action||beat.durationSec!==brief.script[i]?.durationSec)));
 const useCurrentScript=Boolean(scriptBeats?.length&&(!brief||scriptDiffersFromBrief));
 const example=allowExample&&!brief&&!scriptBeats?.length;
 const scenes=useCurrentScript?scriptBeats!.map((beat,i)=>({
  id:String(i+1),seconds:beat.durationSec,line:beat.line,action:beat.action,framing:'План уточняется в Production Brief',
  lighting:'Уточнить свет и план после утверждения сценария',source:'scenario' as const,
 })):brief?productionGuideScenes(brief):example?productionGuideScenes(null):[];
 const briefSync=(()=>{
  if(!brief||scriptDiffersFromBrief)return {changed:false,error:scriptDiffersFromBrief?'Сценарий изменился после создания брифа. Сначала пересоберите бриф.':''};
  try{
   const merged=applyPersonaGuideToBrief(plan,brief);
   return {changed:JSON.stringify(merged)!==JSON.stringify(brief),error:''};
  }catch(error){return {changed:false,error:String((error as Error).message||error)}}
 })();
 const showPilotDirections=allowExample&&scenes.length===exampleActorComposerBeats.length&&
  scenes.every((scene,i)=>scene.line===exampleActorComposerBeats[i].line&&
   scene.action===exampleActorComposerBeats[i].action&&
   scene.seconds===exampleActorComposerBeats[i].seconds);
 const readiness=getPersonaGuideReadiness({
  hasScript:Boolean(scriptBeats?.length||brief?.script.length),
  scriptApproved:approvedScript||Boolean(!scriptBeats?.length&&brief&&pipeline?.materials.editorialDecision?.decision==='approved'),
  hasCurrentBrief:Boolean(brief&&!scriptDiffersFromBrief),
  briefApproved:Boolean(pipeline?.stage==='READY_FOR_SHOOT'&&pipeline.materials.editorialDecision?.decision==='approved'),
  guide:plan,
 });
 const research=workspace?.research??[];
 const reviewed=research.filter(r=>r.observationStatus==='user_reviewed');
 const totalSeconds=scenes.reduce((sum,scene)=>sum+scene.seconds,0);
 const savePlan=(next:PersonaProductionGuide)=>{
  draftRef.current=next;
  setDraftPlan(next);
  setUnsaved(true);
  onDirtyChange?.(true);
  try{
   onSave(next);
   setUnsaved(false);
   onDirtyChange?.(false);
   setNotice('План сохранён в проекте. Это не утверждение съёмки и не разрешение на публикацию.');
  }catch(error){
   setNotice('ВНИМАНИЕ: текст остался на экране, но не сохранён. Не закрывайте страницу. Скачайте съёмочный лист и повторите сохранение. '+String((error as Error).message||error));
  }
 };
 const edit=(key:GuideField,value:string)=>{
  const base=draftRef.current;
  savePlan(reviseGuideField(base,key,value,new Date().toISOString()));
 };
 const mark=(key:(typeof guideChecks)[number][0],checked:boolean)=>{
  const base=draftRef.current;
  savePlan({...base,checks:{...base.checks,[key]:checked},updatedAt:new Date().toISOString()});
 };
 const baseNoteForScene=(scene:(typeof scenes)[number],index:number)=>{
  const pilot=showPilotDirections?actorComposerShotDirections[exampleActorComposerBeats[index].id]:null;
  return {
   camera:pilot?.camera??('angle' in scene&&typeof scene.angle==='string'?scene.angle:'Уточнить положение штатива, высоту, расстояние и крупность'),
   lighting:scene.lighting,
   performance:pilot?.performance??scene.action,
   edit:pilot?.edit??'Указать начало и конец кадра, монтажный переход и смысловую паузу',
  };
 };
 const changeShot=(scene:(typeof scenes)[number],index:number,key:GuideShotField,value:string)=>{
  const base=draftRef.current;
  const previous=guideShotNoteForScene(base,scene).note;
  const fields=previous??baseNoteForScene(scene,index);
  savePlan(updateGuideShotNote(base,scene,{...fields,[key]:value},new Date().toISOString()));
 };
 const reconfirmShot=(scene:(typeof scenes)[number])=>{
  const base=draftRef.current;
  const prior=guideShotNoteForScene(base,scene);
  if(!prior.note||!prior.stale)return;
  savePlan(updateGuideShotNote(base,scene,prior.note,new Date().toISOString()));
 };
 const syncBrief=()=>{
  if(!brief||!onApplyToBrief||unsaved||briefSync.error||!briefSync.changed){
   setNotice('Проверьте сохранение и актуальность сценария и съёмочных указаний перед переносом.');
   return;
  }
  try{
   onApplyToBrief(draftRef.current);
   setNotice('План перенесён в Production Brief. Проверьте обновлённую структурную QA; прежнее авторское утверждение сброшено. Публикации не было.');
  }catch(error){setNotice('Не удалось перенести план: '+String((error as Error).message||error))}
 };
 const discardFailedSave=()=>{
  const lastSaved=stored??createPersonaProductionGuide(new Date().toISOString(),allowExample?'actor_composer':'general');
  draftRef.current=lastSaved;
  setDraftPlan(lastSaved);
  setUnsaved(false);
  onDirtyChange?.(false);
  setNotice('Несохранённые правки отменены по вашему выбору. Сохранённый проект не изменён.');
 };
 const navigate=(step:'script'|'assets'|'edit'|'review')=>{
  if(unsaved){setNotice('Сначала повторите сохранение или скачайте лист: есть несохранённые изменения.');return}
  onNavigate(step);
 };
 const downloadSheet=()=>{
  try{
   const text=exportPersonaShootingSheet({title:projectTitle,angle:projectAngle,guide:plan,
    scenes:scenes.map((scene,index)=>{
     const base=showPilotDirections?{...scene,...actorComposerShotDirections[exampleActorComposerBeats[index].id]}:scene;
     const saved=guideShotNoteForScene(plan,scene);
     return saved.note&&!saved.stale?{...base,...saved.note}:base;
    }),
    references:research.map(ref=>({
     title:ref.title||ref.url,url:ref.url,observedAt:ref.observedAt,
     status:ref.observationStatus==='user_reviewed'?'просмотрено автором':'не просмотрено автором',
    })),sample:example});
   const blob=new Blob([text],{type:'text/markdown;charset=utf-8'});
   const url=URL.createObjectURL(blob),link=document.createElement('a');
   link.href=url;link.download='persona-shooting-sheet.md';
   document.body.appendChild(link);link.click();link.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),1000);
   setNotice('Создан локальный съёмочный лист. Перед съёмкой проверьте версию и наличие файла на устройстве.');
  }catch(error){setNotice('Не удалось скачать лист: '+String((error as Error).message||error));}
 };
 const useExample=()=>{
  try{onUseExample(plan);setNotice('Семь сцен переданы в существующий сценарный редактор как НЕУТВЕРЖДЁННЫЙ кандидат.');}
  catch(error){setNotice(String((error as Error).message||error));}
 };
 return <section className="personaGuide" aria-label="Пошаговый план производства ролика">
  <header className="personaGuideHero">
   <small>PERSONA · PRE-PRODUCTION / НЕ ПУБЛИКАЦИЯ</small>
   <h3>От идеи до первого монтажа</h3>
   <p>Один производственный маршрут для «{projectTitle}»: тема, хук, точные реплики, кадры, свет, звук и монтажный замысел. Все правки сохраняются в этом проекте, а утверждение сценария и видео остаётся отдельным.</p>
   <div className="personaGuideNext"><strong>Твой следующий конкретный шаг</strong><p>{readiness.nextAction}</p>
    <div className="personaGuideReadiness" aria-label="Состояние производственных этапов">
     {readiness.items.map(item=><div key={item.id}><span aria-hidden="true">{item.state==='done'?'✓':item.state==='manual'?'○':'·'}</span><span>{item.label}</span><small>{item.state==='done'?(item.id==='idea'||item.id==='setup'?'Отмечено автором':'Подтверждено в проекте'):item.state==='manual'?'Решение автора':'Ещё не завершено'}</small></div>)}
    </div>
   </div>
   <div className="personaGuideMeter"><span>Чек-лист: {guideProgress(plan)} из {guideChecks.length}</span><span>{unsaved?'Есть несохранённые правки':stored?'План сохранён в проекте':'Предложение · ещё не сохранено'}</span></div>
   <div className="personaGuideActions">{(!stored||unsaved)&&<button type="button" className="primary" onClick={()=>savePlan(draftRef.current)}>{unsaved?'Повторить сохранение':'Сохранить предложенный план'}</button>}<button type="button" className="ghost" onClick={downloadSheet}>Скачать съёмочный лист</button>{unsaved&&<button type="button" className="ghost" onClick={discardFailedSave}>Отменить несохранённые правки</button>}</div>
  </header>

  <article className="personaGuideSection">
   <div className="personaGuideNumber">01</div><h4>Определить идею и проверить актуальность</h4>
   <p><b>Идея этого проекта:</b> {projectTitle}. {projectAngle}</p>
   <p>Актуальность нельзя вывести из даты или количества просмотров чужого ролика. Тему нужно подкрепить источником, датой, механикой и собственной оригинальной интерпретацией.</p>
   {allowExample&&<aside className="personaGuideTrend" aria-label="Публичные сигналы формата">
    <strong>Почему стоит проверить формат «актёр + композитор» сейчас</strong>
    <p><a href="https://later.com/blog/instagram-reels-trends/" target="_blank" rel="noreferrer">Later · обновление 30 октября 2026</a>: 23 октября отмечен формат «не ограничиваться одной нишей» — быстро показывать несколько интересов и сторон личности. Для Persona предлагаем собственную мини-сценку про актёра и композитора, а не копию ролика или чужого звука. Это референс механики, не прогноз охватов.</p>
    <p><a href="https://about.fb.com/news/2026/01/2026-ai-drives-performance/" target="_blank" rel="noreferrer">Meta · 28 января 2026</a>: сообщает о росте доли оригинального контента в Instagram-рекомендациях в США. Это контекст платформы, а не прогноз просмотров конкретного Reels.</p>
    <small>Это публичные источники, не лично просмотренные автором референсные видео; их даты и применимость нужно пересматривать перед съёмкой. Источники не сохраняются как «просмотренные» автоматически.</small>
   </aside>}
   {research.length?<div className="personaGuideEvidence"><b>Референсы, уже записанные в проекте</b>
    {research.map(ref=><div key={ref.id}><span>{ref.observationStatus==='user_reviewed'?'Просмотрен автором':ref.observationStatus==='metadata_only'?'Только метаданные':'Недоступен'}</span>
     {/^https?:\/\//i.test(ref.url)?<a href={ref.url} target="_blank" rel="noreferrer">{ref.title||ref.url}</a>:<span>{ref.title||'Некорректная ссылка'}</span>}
     <small>Дата фиксации: {ref.observedAt||'не указана'}</small></div>)}
    <small>Лично просмотрено: {reviewed.length} из {research.length}. Просмотр не подтверждает популярность или актуальность без дополнительных данных.</small>
    </div>:<p className="personaGuideWarn">Подтверждённых референсов пока нет. Эта идея — творческая гипотеза, а не установленный тренд.</p>}
   <button type="button" className="ghost" onClick={()=>navigate('script')}>Исследовать референсы и сценарий</button>
   {sections[0].fields.map(key=><label key={key}>{guideFieldLabels[key]}
    <textarea aria-label={guideFieldLabels[key]} value={plan.fields[key]} onChange={e=>edit(key,e.target.value)}/></label>)}
  </article>

  <article className="personaGuideSection">
   <div className="personaGuideNumber">02</div><h4>Хук и слова, которые произнести</h4>
   <p>Устная речь — не подпись к ролику. Сохраняем паузы, действия и живую драматургию. Только явное авторское утверждение делает текст съёмочным сценарием.</p>
   {scriptDiffersFromBrief&&<p className="personaGuideWarn" role="status">Сохранённый сценарий изменился после создания Production Brief. Ниже показана АКТУАЛЬНАЯ редакция сценария, но кадры и монтажный бриф устарели. Пересоберите бриф и пройдите редакторскую приёмку заново.</p>}
   <div className="personaGuideHook"><small>{example?'ГОТОВЫЙ РАБОЧИЙ ПРИМЕР · НЕ ПРИМЕНЁН К ПРОЕКТУ':approvedScript?'АВТОРСКАЯ ВЕРСИЯ СЦЕНАРИЯ':'ТЕКУЩИЙ НЕУТВЕРЖДЁННЫЙ СЦЕНАРИЙ / БРИФ'}</small>
    <b>Хук 0–{scenes[0]?.seconds??0} с: «{scenes[0]?.line??'Сначала сформируйте сценарий'}»</b>
    <span>Цель — сразу показать противоречие или действие; не заставка и не общее представление.</span>
   </div>
   {!scenes.length&&<p className="personaGuideWarn">Для этой идеи ещё нет утверждённых реплик и раскадровки. Откройте «Сценарий»: добавьте источники, выберите оригинальную идею, напишите хук, развитие и финал. Затем здесь появятся именно ваши сцены.</p>}
   <div className="personaGuideShots">
    {scenes.map((scene,index)=><div className="personaGuideShot" key={scene.id+'-'+index}>
     <div><strong>{scene.id} · {scene.framing}</strong><small>{scene.seconds} с · {index===0?'Хук':index===scenes.length-1?'Панчлайн':'Развитие'}</small>{example&&exampleActorComposerSourceFiles[scene.id]&&<small>Исходный дубль: {exampleActorComposerSourceFiles[scene.id]}</small>}</div>
     <div className="personaGuideStoryboard" aria-label={scene.id+': схема крупности и композиции'}>
      <svg viewBox="0 0 170 225" role="img" aria-label={'Схематичная вертикальная композиция: '+scene.framing}>
       <rect x="1" y="1" width="168" height="223" rx="9" fill="#e6e1d7" stroke="#aaa499"/>
       <path d="M2 75H168 M2 150H168 M57 2V223 M113 2V223" stroke="#c3bcaf" strokeWidth="0.8" strokeDasharray="4 4"/>
       <rect x="11" y="14" width="148" height="16" rx="4" fill="#eee9df"/>
       <ellipse cx="86" cy={scene.framing.toLowerCase().includes('крупн')||scene.framing==='close-up'?87:112} rx={scene.framing.toLowerCase().includes('крупн')||scene.framing==='close-up'?37:25} ry={scene.framing.toLowerCase().includes('крупн')||scene.framing==='close-up'?47:32} fill="#baaa93"/>
       <path d="M30 223 Q32 156 86 149 Q138 156 140 223" fill="#847c72"/>
       {scene.id.startsWith('B')&&<><rect x="12" y="182" width="146" height="29" rx="4" fill="#3b3b37"/>{Array.from({length:9},(_,k)=><rect key={k} x={16+k*15} y="185" width="12" height="18" fill="#ecece6"/>)}</>}
       <rect x="35" y="196" width="100" height="22" rx="5" fill="#151515" opacity=".85"/>
       <text x="85" y="211" textAnchor="middle" fontSize="11" fill="#fff">{scene.id}</text>
      </svg>
      <small>СХЕМА КОМПОЗИЦИИ · НЕ РЕАЛЬНЫЙ КАДР</small>
     </div>
     <blockquote>«{scene.line}»</blockquote><p><b>Что делать:</b> {scene.action}</p><p><b>Кадр и свет:</b> {scene.lighting}</p>
     {'angle' in scene&&typeof scene.angle==='string'&&<p><b>Ракурс:</b> {scene.angle}</p>}
     {'cameraMovement' in scene&&typeof scene.cameraMovement==='string'&&<p><b>Движение камеры:</b> {scene.cameraMovement}</p>}
     {(()=>{
      const saved=guideShotNoteForScene(plan,scene);
      const note=saved.note??baseNoteForScene(scene,index);
      return <details className="personaGuideShotEditor">
       <summary>Режиссёрский план этого кадра {saved.stale?'· требует повторной проверки':saved.note?'· сохранён':'· уточнить'}</summary>
       {saved.stale&&<div className="personaGuideWarn" role="status">
        Реплика, действие или длительность изменились. Старые указания сохранены, но больше не считаются согласованными.
        <button type="button" className="ghost" onClick={()=>reconfirmShot(scene)}>Я сверил указания с новой версией — подтвердить</button>
       </div>}
       {([
        ['camera','Камера, крупность, расстояние и ракурс'],
        ['lighting','Свет, тени и отражения'],
        ['performance','Актёрская задача, движения и интонация'],
        ['edit','Начало, конец, склейка, музыка'],
       ] as [GuideShotField,string][]).map(([field,label])=><label key={field}>{label}
        <textarea value={note[field]} disabled={saved.stale} onChange={e=>changeShot(scene,index,field,e.target.value)}
         aria-label={scene.id+' · '+label} maxLength={4000}/>
       </label>)}
       <small>Это режиссёрские заметки. Они не меняют утверждённый Production Brief и не запускают монтаж.</small>
      </details>;
     })()}
     {(()=>{
      const saved=guideShotNoteForScene(plan,scene);
      const authored=saved.note&&!saved.stale?saved.note:null;
      const preset=showPilotDirections?actorComposerShotDirections[exampleActorComposerBeats[index].id]:null;
      const visible=authored??preset;
      return visible&&<div className="personaGuideDirection">
       <small>{authored?'Авторские режиссёрские указания':'Рабочее предложение · проверь на площадке'}</small>
       <p><b><span aria-hidden="true">▣</span> Камера:</b> {visible.camera}</p>
       {authored&&<p><b>Свет:</b> {authored.lighting}</p>}
       <p><b>Игра:</b> {visible.performance}</p>
       <p><b>Монтаж:</b> {visible.edit}</p>
      </div>;
     })()}
    </div>)}
   </div>
   <p><b>Предполагаемая длительность:</b> {totalSeconds} секунд. Точная речь, таймкоды, интонации и паузы проверяются по реальным дублям.</p>
   {example&&allowExample&&<button type="button" className="primary" onClick={useExample}>Создать редактируемый сценарий из этих 7 сцен</button>}
   {(!example||!allowExample)&&<button type="button" className="ghost" onClick={()=>navigate('script')}>Редактировать реплики в сценарии</button>}
   {brief&&<button type="button" className="ghost" onClick={()=>navigate('review')}>Проверить съёмочный бриф и авторское решение</button>}
  </article>

  <article className="personaGuideSection">
   <div className="personaGuideNumber">03</div><h4>Локация, камера, свет, звук и реквизит</h4>
   <p>Сначала выбери реальные зоны и сделай десятисекундную проверку лица и звука. Поля ниже — редактируемый план, не подтверждение наличия оборудования.</p>
   <figure className="personaGuideDiagram">
    <svg viewBox="0 0 460 235" role="img" aria-label="Схема предполагаемой постановки в комнате: смартфон перед актёром, основной мягкий свет под углом 45 градусов, клавиши во второй зоне">
     <rect x="8" y="8" width="444" height="219" rx="16" fill="#f8f6f1" stroke="#dad5cb"/>
     <rect x="28" y="25" width="404" height="38" rx="8" fill="#e3e2db"/><text x="230" y="49" textAnchor="middle" fontSize="13" fill="#555">Нейтральный фон · без лишних деталей</text>
     <circle cx="143" cy="119" r="27" fill="#cdc2ae"/><text x="143" y="123" textAnchor="middle" fontSize="12" fill="#252421">Актёр</text>
     <circle cx="325" cy="119" r="27" fill="#c4c7bd"/><text x="325" y="123" textAnchor="middle" fontSize="11" fill="#252421">Комп.</text>
     <rect x="283" y="65" width="88" height="15" rx="4" fill="#393936"/><text x="327" y="76" textAnchor="middle" fill="#fff" fontSize="9">Клавиши</text>
     <rect x="195" y="184" width="70" height="26" rx="8" fill="#333"/><text x="230" y="201" textAnchor="middle" fill="#fff" fontSize="12">Камера</text>
     <path d="M215 182 L151 146 M244 182 L316 146" stroke="#858073" strokeWidth="2" strokeDasharray="5 4"/>
     <ellipse cx="70" cy="155" rx="39" ry="14" fill="#e9cc96" stroke="#ad935d"/><text x="70" y="159" textAnchor="middle" fontSize="11" fill="#4c402f">Свет 45°</text>
     <path d="M105 153 L123 136" stroke="#bf9556" strokeWidth="3"/>
     <text x="232" y="174" textAnchor="middle" fontSize="10" fill="#706b62">Одна камера · две позиции</text>
    </svg>
    <figcaption>Схема постановки, не фотография твоей комнаты. Фактическое расположение окна, розеток, клавиш и штатива нужно уточнить на месте.</figcaption>
   </figure>
   {briefMismatchFields.length>0&&<p className="personaGuideWarn" role="status">Плановые заметки отличаются от Production Brief: {briefMismatchFields.join(', ')}. Изменения в редакторе плана не попадают в бриф автоматически.</p>}
   {brief&&<div className="personaGuideBriefSync">
    <strong>Передача режиссёрских решений в Production Brief</strong>
    <p>Переносит локацию, свет, звук, костюм, титры, цвет и сохранённые указания по кадрам. Реплики и длительности не изменяются. После переноса прежнее утверждение снимается, требуется новая QA и решение автора.</p>
    {briefSync.error?<p className="personaGuideWarn" role="alert">{briefSync.error}</p>:
     !briefSync.changed?<p>Сохранённые решения уже совпадают с этим Production Brief.</p>:
     <button type="button" className="primary" disabled={unsaved||!onApplyToBrief}
      onClick={syncBrief}>Перенести решения в бриф и сбросить прежнее утверждение</button>}
   </div>}
   {sections[1].fields.map(key=><label key={key}>{guideFieldLabels[key]}
    <textarea aria-label={guideFieldLabels[key]} value={plan.fields[key]} onChange={e=>edit(key,e.target.value)}/></label>)}
   <button type="button" className="ghost" onClick={()=>navigate('assets')}>Перейти к исходникам и дублям</button>
  </article>

  <article className="personaGuideSection">
   <div className="personaGuideNumber">04</div><h4>Предварительный монтаж и обработка</h4>
   <p>Договориться о структуре заранее: порядок кадров, смысловые склейки, субтитры, музыкальная точка, цвет и безопасность внешности. Никаких автоматических изменений оригиналов.</p>
   {sections[2].fields.map(key=><label key={key}>{guideFieldLabels[key]}
    <textarea aria-label={guideFieldLabels[key]} value={plan.fields[key]} onChange={e=>edit(key,e.target.value)}/></label>)}
   <button type="button" className="ghost" onClick={()=>navigate('edit')}>Открыть монтажный план / таймлайн</button>
  </article>

  <article className="personaGuideSection">
   <div className="personaGuideNumber">05</div><h4>Что сделать перед первым дублем</h4>
   <p>Отметки являются твоими собственными задачами. Они не дают художественного PASS и не открывают публикацию.</p>
   <div className="personaGuideChecks">{guideChecks.map(([key,label])=><label key={key}><input type="checkbox" checked={plan.checks[key]===true} onChange={e=>mark(key,e.target.checked)}/><span>{label}</span></label>)}</div>
   <div className="personaGuideActions"><button type="button" className="ghost" onClick={()=>navigate('review')}>К проверке и авторскому утверждению</button><button type="button" className="ghost" onClick={()=>navigate('edit')}>К монтажу</button></div>
   <p className="personaGuideWarn">Готовность к съёмке определяется проверкой Production Brief и решением автора. Готовность к публикации — отдельной приёмкой реального MP4.</p>
  </article>
  {notice&&<p className="personaGuideNotice" role={unsaved?'alert':'status'}>{notice}</p>}
 </section>;
}
