import { useCallback, useEffect, useRef, useState } from "react";
import type { CreativeItem } from "../../../supabase/functions/life-os-runtime-prototype-v3/persona-creative-core";
import { personaEdgeRequest } from "./edgeRuntimeClient";
import { createMediaMetadata, listCapturedAssets, persistCapturedAsset, type CreativeMediaMetadata } from "./personaMediaIntake";
import { roleLabel, type MediaOverride } from "./personaMediaRoles";
import "./persona-creative-v1.css";

type ViewItem = CreativeItem & {verifiedFreshness:"cached"|"stale"|"unverified"};
type Api = Record<string,any>;
const str=(v:unknown)=>typeof v==="string"?v:"";
const niceError=(e:unknown)=>{
 const message=e instanceof Error?e.message:String(e);
 if(message.includes("revision_conflict"))return "Изменилась редакция. Обнови идеи и повтори действие.";
 if(message.includes("revision_pending"))return "Сначала реши, принимать ли предложенную правку.";
 if(message.includes("approval_not_current"))return "Эту редакцию нужно снова утвердить перед съёмкой.";
 return "Не удалось завершить действие: "+message.slice(0,120);
};
export default function PersonaCreativeLoop(){
 const [items,setItems]=useState<ViewItem[]>([]);
 const [selected,setSelected]=useState("");
 const [instruction,setInstruction]=useState("");
 const [conditions,setConditions]=useState("");
 const [roleOverride,setRoleOverride]=useState<MediaOverride>("auto");
 const [localAssets,setLocalAssets]=useState<CreativeMediaMetadata[]>([]);
 const [busy,setBusy]=useState(false);
 const [loaded,setLoaded]=useState(false);
 const [error,setError]=useState("");
 const [feedback,setFeedback]=useState("");
 const [erikaAssessment,setErikaAssessment]=useState("");
 const [justApplied,setJustApplied]=useState(false);
 const responseRef=useRef<HTMLDivElement|null>(null);
 const refresh=useCallback(async(seed=false)=>{
  const response=await personaEdgeRequest({action:seed?"creative_shortlist":"creative_state"}) as {items?:ViewItem[]};
  const safe=Array.isArray(response.items)?response.items.slice(0,3):[];
  setItems(safe);return safe;
 },[]);
 useEffect(()=>{let live=true;void refresh(true).then(()=>{if(live)setLoaded(true)})
   .catch(e=>{if(live){setError(niceError(e));setLoaded(true)}});return()=>{live=false}},[refresh]);
 const item=items.find(x=>x.id===selected);
 const revision=item?.revisions.find(x=>x.version===item.currentVersion);
 const idea=revision?.idea;
 const actionable=item?.verifiedFreshness==="cached"&&!item.pending&&!!revision?.proof;
 const session=item?.session&&item.session.ideaVersion===item.currentVersion?item.session:null;
 const lastPrevious=item?.revisions.find(x=>x.version===item.currentVersion-1);
 const latestReason=revision?.reason;
 useEffect(()=>{if(!session){setLocalAssets([]);return}
  let live=true;void listCapturedAssets(session.id).then(assets=>{if(live)setLocalAssets(assets)})
  .catch(()=>{if(live)setError("Локальные материалы недоступны.")});return()=>{live=false};
 },[session?.id]);
 async function act(payload:Record<string,unknown>,message=""){
  setBusy(true);setError("");setFeedback("");
  try{const answer=await personaEdgeRequest(payload) as Api;await refresh();if(message)setFeedback(message);return answer}
  catch(e){setError(niceError(e));return null}
  finally{setBusy(false)}
 }
 async function edit(){
  if(!item||!instruction.trim())return;
  setErikaAssessment("Эрика проверяет, улучшает ли правка идею…");setJustApplied(false);
  const answer=await act({action:"creative_edit",ideaId:item.id,baseVersion:item.currentVersion,instruction});
  if(answer){
   setErikaAssessment(str(answer.critic));
   if(answer.proposedVersion)setInstruction("");
   window.requestAnimationFrame(()=>responseRef.current?.scrollIntoView({block:"nearest",behavior:"smooth"}));
  }else setErikaAssessment("");
 }
 async function approve(){
  if(!item||busy)return;
  const answer=await act({action:"creative_approve",ideaId:item.id,expectedVersion:item.currentVersion});
  if(answer?.approved){setJustApplied(true);setErikaAssessment("Правка принята после новой редакционной проверки.");
   setFeedback("Готово: новая редакция сохранена. Сниматься будет только утверждённый текст.");
   setConditions("");
   window.requestAnimationFrame(()=>responseRef.current?.scrollIntoView({block:"nearest",behavior:"smooth"}));
  }
 }
 async function start(adapt=false){
  if(!item||!revision||!actionable)return;
  await act({action:adapt?"creative_adapt_brief":"creative_start_session",
   ideaId:item.id,version:item.currentVersion,approvalProof:revision.proof,conditions},
   adapt?"Задание обновлено под твои условия.":"Съёмка готова. Теперь можно загрузить материал.");
 }
 async function upload(files:File[]){
  if(!files.length||!session||!item||!revision||!actionable)return;
  setBusy(true);setError("");setFeedback("");
  let stored=0,registered=0;
  const batchRoles:Array<{role?:string;kind?:string}>=[...localAssets,...session.assets];
  try{
   for(const file of files.slice(0,12)){
    const meta=createMediaMetadata(file,{projectId:item.projectId,contentItemId:item.contentItemId,
     ideaId:item.id,ideaVersion:item.currentVersion,sessionId:session.id,
     existing:batchRoles,roleOverride});
    await persistCapturedAsset(meta,file);stored++;
    batchRoles.push(meta);
    setLocalAssets(current=>[...current.filter(x=>x.id!==meta.id),meta]);
    try{const result=await personaEdgeRequest({action:"creative_register_asset",
      ideaId:item.id,version:item.currentVersion,approvalProof:revision.proof,asset:meta});
      if(result.registered)registered++;
    }catch{/* Local bytes remain committed, never claim successful server sync. */}
   }
   await refresh();
   setFeedback("Сохранено на iPhone: "+stored+". Учтено в сессии: "+registered+
    ". Persona определила типы файлов автоматически. Исходники пока только на устройстве.");
  }catch(e){setError(niceError(e))}
  finally{setBusy(false)}
 }
 return <section className="creativeV1" aria-label="Persona Creative Loop V1">
   <div className="creativeHead"><small>PERSONA · МОИ СЪЁМКИ</small><h2>Выбери, что снимем</h2>
    <p>Три разные идеи. Лучше один сильный ролик, чем много слабых.</p></div>
   {!loaded?<p role="status">Подбираю идеи…</p>:null}
   {loaded&&items.length===0?<p role="status">Сейчас нет идей, прошедших проверку. Не будем снимать ради количества.</p>:null}
   <div className="creativeShortlist">
    {items.map((entry,index)=>{
     const current=entry.revisions.find(x=>x.version===entry.currentVersion);
     const concept=current?.idea||{};
     return <article className={"creativeIdea"+(selected===entry.id?" selected":"")} key={entry.id}>
      <small>{index===0?"РЕКОМЕНДУЮ":"ВАРИАНТ "+(index+1)}</small>
      <h3>{str(concept.title)}</h3>
      <p>{str(concept.angle)}</p>
      <p><b>Начало:</b> {str(concept.hook)}</p>
      <p><b>Снять:</b> {str(concept.soloPlan)||str(concept.angle)}</p>
      <p><b>Почему тебе:</b> {str(concept.reason)}</p>
      <p><b>Время:</b> около {String(concept.estimatedMinutes||"—")} мин.</p>
      <button className="primary creativeSelect" disabled={busy||entry.verifiedFreshness!=="cached"}
       aria-pressed={selected===entry.id}
       onClick={()=>{setSelected(entry.id);setFeedback("");setInstruction("");setConditions("");
        setErikaAssessment("");setJustApplied(false)}}>
       {selected===entry.id?"Выбрано ✓":"Выбрать идею "+(index+1)}
      </button>
      <details className="creativeDetails"><summary>Подробнее об идее</summary>
       <p>Формат: {str(concept.format)} · редакция {entry.currentVersion}</p>
       <p>Подтверждены рекомендации по формату, не обещание просмотров.</p>
       <p>Достоверность: {str(entry.verifiedFreshness)} · {String(concept.confidence||"—")}%</p>
      </details>
     </article>
    })}
   </div>
   {item&&revision&&<>
    <section className="creativeEditor" aria-label="Редактор Эрика">
     <small>ЭРИКА · ОБСУЖДЕНИЕ ИДЕИ</small>
     <h3>{str(idea?.title)}</h3>
     <p><b>Что сказать:</b> {str(idea?.script)}</p>
     <label htmlFor="creative-erika-input">Что изменим?</label>
     <textarea id="creative-erika-input" rows={3} value={instruction} onChange={e=>setInstruction(e.target.value)}
      placeholder="Поменяй финал, сделай смешнее, без пафоса. Что думаешь о моей правке?"/>
     <button className="primary creativeDiscuss" onClick={()=>void edit()}
      disabled={busy||!instruction.trim()||!!item.pending}>
      {busy?"Эрика проверяет…":"Обсудить с Эрикой"}
     </button>
     <div ref={responseRef} className="creativeEditorialResponse" aria-live="polite">
      {erikaAssessment&&!item.pending&&<p role="status"><b>Эрика:</b> {erikaAssessment}</p>}
      {item.pending&&<div className="creativeProposal" role="status">
       <h4>Эрика предлагает изменить текст</h4>
       <p><b>Было:</b> {str(idea?.script)}</p>
       <p><b>Предлагаю:</b> {str(item.pending.idea.script)}</p>
       {str(item.pending.idea.hook)!==str(idea?.hook)&&
         <p><b>Новое начало:</b> {str(item.pending.idea.hook)}</p>}
       <p><b>Почему:</b> {item.pending.critic}</p>
       <div className="creativeActions">
        <button className="primary" disabled={busy||item.pending.status!=="APPROVE"}
          onClick={()=>void approve()}>Применить</button>
        <button disabled={busy} onClick={()=>void act({action:"creative_discard_proposal",
          ideaId:item.id,baseVersion:item.currentVersion},"Оставили исходный вариант.")}>Оставить как было</button>
       </div>
      </div>}
      {justApplied&&item.currentVersion>1&&<div className="creativeApplied" role="status">
        <b>✓ Правка применена и проверена</b>
        <p><b>Что изменилось:</b> {latestReason}</p>
        {lastPrevious&&<p><b>Раньше:</b> {str(lastPrevious.idea.script)}</p>}
        <p><b>Теперь:</b> {str(idea?.script)}</p>
       </div>}
     </div>
     <details className="creativeDetails"><summary>История правок и проверка</summary>
      {item.revisions.map(r=><p key={r.version}>Редакция {r.version}: {r.reason} · {r.judge}</p>)}
     </details>
    </section>
    <section className="creativeCapture" aria-label="Съёмка и загрузка материала">
     <h3>Снять этот ролик</h3>
     <label htmlFor="creative-conditions">Условия съёмки</label>
     <textarea id="creative-conditions" rows={2} value={conditions} onChange={e=>setConditions(e.target.value)}
      placeholder="Нет штатива, плохой свет, один, есть 7 минут…"/>
     {!session?<button className="primary creativeTake" disabled={busy||!actionable}
       onClick={()=>void start()}>Берём — создать задание</button>:
      <>
       <div className="creativeBrief" aria-label="Краткое съёмочное задание">
        <h3>Съёмочное задание</h3>
        <p><b>Что сказать / сделать:</b> {str(idea?.hook)} {str(idea?.script)}</p>
        {Array.isArray(session.brief.shots)&&session.brief.shots.slice(0,1).map((shot:any)=>
         <div key={shot.id}>
          <p><b>Телефон:</b> {str(shot.cameraPosition)}</p>
          <p><b>Кадр:</b> {str(shot.composition)}</p>
          <p><b>Дублей:</b> {String(shot.takes||2)} · <b>Длина:</b> около {String(shot.durationSeconds||25)} сек.</p>
         </div>)}
        <p><b>Свет:</b> {str(session.brief.lighting)}</p>
        <details className="creativeDetails"><summary>Технические детали</summary>
         <p><b>Звук:</b> {str(session.brief.audio)}</p>
         <p><b>Фон:</b> {str(session.brief.background)}</p>
         <p>Вертикальное видео · {str(session.brief.resolution)} · {String(session.brief.fps)} кадр/с.</p>
        </details>
       </div>
       <button className="creativeAdapt" disabled={busy||!actionable}
        onClick={()=>void start(true)}>Подстроить под условия</button>
       <section className="creativeUpload">
        <h3>Загрузить материал</h3>
        <p>Выбери файлы — Persona сама предварительно определит, где дубли, B-roll, фото или звук.</p>
        <label className="creativePicker">Выбрать фото или видео
         <input aria-label="Загрузить материал" type="file"
          accept="video/*,image/*,audio/*,.mov,.mp4,.m4a" multiple disabled={busy}
          onChange={e=>{const picker=e.currentTarget;const files=Array.from(picker.files||[]);
           void upload(files).finally(()=>{picker.value=""})}}/>
        </label>
        <details className="creativeDetails creativeOverride">
         <summary>Изменить определение типа вручную</summary>
         <label htmlFor="creative-upload-kind">Тип всех файлов следующей загрузки</label>
         <select id="creative-upload-kind" value={roleOverride}
          onChange={e=>setRoleOverride(e.target.value as MediaOverride)}>
          <option value="auto">Persona определит сама</option>
          <option value="primary_take">Основной дубль</option>
          <option value="alternate_take">Другой дубль</option>
          <option value="broll">B-roll</option>
          <option value="photo">Фото</option>
          <option value="audio">Отдельный звук</option>
          <option value="reference_other">Референс / другое</option>
         </select>
        </details>
        <div className="creativeAssets">
         <b>На этом iPhone: {localAssets.length} файл(ов)</b>
         {localAssets.map(asset=><p key={asset.id}>
           {roleLabel(asset.role||"reference_other")} · {asset.filename}</p>)}
         <details className="creativeDetails"><summary>Где хранятся файлы</summary>
          <p>Пока исходники хранятся только в Safari этого iPhone, не в облаке.
            Не удаляй данные сайта. Анализ дублей и монтаж — следующий этап.</p>
         </details>
        </div>
       </section>
      </>}
    </section>
   </>}
   {feedback&&<p role="status" className="creativeFeedback">{feedback}</p>}
   {error&&<p role="alert" className="creativeError">{error}</p>}
  </section>;
}
