import { useCallback, useEffect, useState } from "react";
import type { CreativeItem, CreativeSession } from "../../../supabase/functions/life-os-runtime-prototype-v3/persona-creative-core";
import { personaEdgeRequest } from "./edgeRuntimeClient";
import { createMediaMetadata, listCapturedAssets, persistCapturedAsset, type CreativeMediaMetadata } from "./personaMediaIntake";
import "./persona-creative-v1.css";

type ViewItem = CreativeItem & {verifiedFreshness:"cached"|"stale"|"unverified"};
type Api = Record<string,any>;
const niceError=(e:unknown)=>{
 const message=e instanceof Error?e.message:String(e);
 if(message.includes("revision_conflict"))return "Появилась другая редакция. Обнови список и попробуй снова.";
 if(message.includes("revision_pending"))return "Сначала утверди либо отклони предложенную правку.";
 if(message.includes("approval_not_current"))return "Подтверждение устарело. Для съёмки нужна актуальная подписанная версия.";
 if(message.includes("quality_gate"))return "Редактор не пропустил эту редакцию по качеству.";
 return "Не удалось завершить действие: "+message.slice(0,120);
};
const str=(value:unknown)=>typeof value==="string"?value:"";

export default function PersonaCreativeLoop(){
 const [items,setItems]=useState<ViewItem[]>([]);
 const [selected,setSelected]=useState("");
 const [instruction,setInstruction]=useState("");
 const [conditions,setConditions]=useState("");
 const [videoKind,setVideoKind]=useState<"take"|"broll">("take");
 const [localAssets,setLocalAssets]=useState<CreativeMediaMetadata[]>([]);
 const [busy,setBusy]=useState(false);
 const [loaded,setLoaded]=useState(false);
 const [error,setError]=useState("");
 const [feedback,setFeedback]=useState("");
 const refresh=useCallback(async (seed=false)=>{
  const result=await personaEdgeRequest({action:seed?"creative_shortlist":"creative_state"}) as {items?:ViewItem[]};
  const safe=Array.isArray(result.items)?result.items.slice(0,3):[];
  setItems(safe);
  return safe;
 },[]);
 useEffect(()=>{
  let live=true;
  void refresh(true).then(()=>{if(live)setLoaded(true)})
   .catch(e=>{if(live){setError(niceError(e));setLoaded(true)}});
  return ()=>{live=false};
 },[refresh]);
 const item=items.find(x=>x.id===selected);
 const revision=item?.revisions.find(x=>x.version===item.currentVersion);
 const idea=revision?.idea;
 const actionable=item?.verifiedFreshness==="cached" && !item.pending && !!revision?.proof;
 const session=item?.session && item.session.ideaVersion===item.currentVersion?item.session:null;
 useEffect(()=>{
  if(!session){setLocalAssets([]);return;}
  let live=true;
  void listCapturedAssets(session.id).then(xs=>{if(live)setLocalAssets(xs)})
   .catch(()=>{if(live)setError("Локальное медиахранилище недоступно.")});
  return ()=>{live=false};
 },[session?.id]);
 async function act(payload:Record<string,unknown>,message=""){
  setBusy(true);setError("");setFeedback("");
  try{
   const result=await personaEdgeRequest(payload) as Api;
   await refresh();
   if(message)setFeedback(message);
   return result;
  }catch(e){setError(niceError(e));return null}
  finally{setBusy(false)}
 }
 async function edit(){
  if(!item||!instruction.trim())return;
  const answer=await act({action:"creative_edit",ideaId:item.id,baseVersion:item.currentVersion,instruction});
  if(answer){setFeedback(str(answer.critic)+(answer.judge?" · Judge: "+str(answer.judge):""));
    if(answer.proposedVersion)setInstruction("");}
 }
 async function approve(){
  if(!item)return;
  const r=await act({action:"creative_approve",ideaId:item.id,expectedVersion:item.currentVersion},
   "Новая редакция утверждена отдельным серверным ревью. Предыдущая подпись не перенесена.");
  if(r)setConditions("");
 }
 async function start(adapt=false){
  if(!item||!revision||!actionable)return;
  await act({action:adapt?"creative_adapt_brief":"creative_start_session",
    ideaId:item.id,version:item.currentVersion,approvalProof:revision.proof,conditions},
   adapt?"Съёмочное задание изменено под реальные условия.":"Съёмочная сессия связана с утверждённой версией.");
 }
 async function upload(files:File[]){
  if(!files.length||!session||!item||!revision||!actionable)return;
  setBusy(true);setError("");let stored=0,registered=0;
  try{
   for(const file of files.slice(0,12)){
    const meta=createMediaMetadata(file,{
      projectId:item.projectId,contentItemId:item.contentItemId,ideaId:item.id,
      ideaVersion:item.currentVersion,sessionId:session.id,preferredVideo:videoKind
    });
    // Never tell the user it was saved until the IndexedDB transaction commits.
    await persistCapturedAsset(meta,file);stored++;
    setLocalAssets(current=>[...current.filter(x=>x.id!==meta.id),meta]);
    try{
      const r=await personaEdgeRequest({action:"creative_register_asset",
       ideaId:item.id,version:item.currentVersion,approvalProof:revision.proof,asset:meta});
      if(r.registered)registered++;
    }catch{
      // Binary is safe in IndexedDB; manifest reconciliation needs a later retry.
    }
   }
   await refresh();
   setFeedback("На этом iPhone сохранено: "+stored+" файл(ов). Метаданные синхронизированы: "+registered+
    ". Исходники пока НЕ загружены в облако. Не удаляй данные Safari.");
  }catch(e){setError(niceError(e))}
  finally{setBusy(false)}
 }
 return <section className="creativeV1" aria-label="Persona Creative Loop V1">
   <header className="creativeHead"><div><small>PERSONA CREATIVE LOOP V1 · FREE_ONLY</small>
     <h2>От идеи до материала</h2>
     <p>Три редакционно подготовленных варианта. Ни один не выдаётся за свежий тренд без данных. Ты выбираешь; Эрика критикует правки.</p>
   </div></header>
   {!loaded?<p role="status">Проверяю подписанный список…</p>:null}
   {loaded&&items.length===0?<p role="status">Проверенных идей сейчас нет: новые варианты не будут выданы как утверждённые без актуальных источников.</p>:null}
   <div className="creativeShortlist">
   {items.map((entry,index)=>{
      const current=entry.revisions.find(x=>x.version===entry.currentVersion);
      const concept=current?.idea||{};
      return <article className={selected===entry.id?"creativeIdea selected":"creativeIdea"} key={entry.id}>
       <small>{index===0?"ОСНОВНАЯ РЕКОМЕНДАЦИЯ":"АЛЬТЕРНАТИВА "+index} · v{entry.currentVersion} · {entry.verifiedFreshness}</small>
       <h3>{str(concept.title)}</h3><p>{str(concept.angle)}</p>
       <p><b>Хук:</b> {str(concept.hook)}</p>
       <p><b>Формат:</b> {str(concept.format)} · <b>Снять:</b> {String(concept.estimatedMinutes||"—")} мин</p>
       <p><b>Почему тебе подходит:</b> {str(concept.reason)}</p>
       <p className="creativeEvidence">Подтверждены рекомендации по формату, не актуальная вирусность · confidence {String(concept.confidence||"—")}%</p>
       <button className="primary" disabled={busy||entry.verifiedFreshness!=="cached"}
         onClick={()=>{setSelected(entry.id);setFeedback("");setInstruction("");setConditions("");}}>
         {selected===entry.id?"Выбрано":"Выбрать идею "+(index+1)}
       </button>
      </article>
   })}
   </div>
   {item&&revision&&<>
    <div className="creativeEditor">
     <small>ЭРИКА · РЕДАКЦИЯ · ИДЕЯ v{item.currentVersion}</small>
     <h3>{str(idea?.title)}</h3>
     <p><b>Хук:</b> {str(idea?.hook)}</p><p><b>Сценарий:</b> {str(idea?.script)}</p>
     <div className="creativeHistory">
      <b>История версий</b>
      {item.revisions.map(r=><p key={r.version}>v{r.version} · {r.reason} · {r.judge}</p>)}
     </div>
     <label htmlFor="creative-erika-input">Что изменить или обсудить с Эрикой?</label>
     <textarea id="creative-erika-input" rows={3} value={instruction} onChange={e=>setInstruction(e.target.value)}
       placeholder="Мне нравится идея 2, но поменяй финал. Без экспертной подачи. Что думаешь о моей правке?"/>
     <button className="primary" onClick={()=>void edit()} disabled={busy||!instruction.trim()||!!item.pending}>Обсудить с Эрикой</button>
     {item.pending&&<div className="creativeProposal" role="status">
        <small>ПРЕДЛОЖЕНИЕ v{item.pending.nextVersion} · ЕЩЁ НЕ УТВЕРЖДЕНО</small>
        <p><b>Новый хук:</b> {str(item.pending.idea.hook)}</p>
        <p><b>Новый текст:</b> {str(item.pending.idea.script)}</p>
        <p><b>Critic:</b> {item.pending.critic}</p><p><b>Judge:</b> {item.pending.judge}</p>
        <div className="creativeActions">
        <button className="primary" disabled={busy||item.pending.status!=="APPROVE"}
           onClick={()=>void approve()}>Утверждаю v{item.pending.nextVersion}</button>
        <button disabled={busy} onClick={()=>void act({action:"creative_discard_proposal",ideaId:item.id,baseVersion:item.currentVersion})}>Не берём правку</button>
        </div>
       </div>}
    </div>
    <div className="creativeCapture">
     <small>СЪЁМКА · {item.projectId} / {item.contentItemId} / v{item.currentVersion}</small>
     <label htmlFor="creative-conditions">Реальные условия съёмки</label>
     <textarea id="creative-conditions" rows={2} value={conditions} onChange={e=>setConditions(e.target.value)}
      placeholder="Снимаю один, нет штатива, плохой свет, есть 7 минут, дома"/>
     {!session?<button className="primary" disabled={busy||!actionable}
        onClick={()=>void start()}>Берём v{item.currentVersion} — создать съёмку</button>:
      <>
       <div className="creativeBrief">
        <h3>Съёмочное задание · версия {session.briefVersion}</h3>
        <p><b>Свет:</b> {str(session.brief.lighting)}</p>
        <p><b>Фон:</b> {str(session.brief.background)}</p>
        <p><b>Звук:</b> {str(session.brief.audio)}</p>
        {Array.isArray(session.brief.shots)&&session.brief.shots.map((shot:any)=>
          <p key={shot.id}><b>{shot.purpose} · {shot.durationSeconds} сек.</b> {shot.action} · {shot.cameraPosition}</p>)}
       </div>
       <button disabled={busy||!actionable} onClick={()=>void start(true)}>Адаптировать съёмку с Эрикой</button>
       <div className="creativeUpload">
        <h3>Следующий шаг — Загрузить материал</h3>
        <p>Видео, несколько дублей, фото, B-roll и отдельный звук. Файлы сохраняются в хранилище Safari этого iPhone; облачная загрузка появится в следующем этапе.</p>
        <label htmlFor="creative-upload-kind">Видео относятся к</label>
        <select id="creative-upload-kind" value={videoKind} onChange={e=>setVideoKind(e.target.value as "take"|"broll")}>
          <option value="take">Дублям</option><option value="broll">B-roll</option>
        </select>
        <label className="creativePicker">Выбрать файлы с iPhone
         <input aria-label="Загрузить материал" type="file" accept="video/*,image/*,audio/*,.mov,.mp4,.m4a" multiple disabled={busy}
          onChange={e=>{const picker=e.currentTarget;const list=Array.from(picker.files||[]);void upload(list).finally(()=>{picker.value="";});}}/>
        </label>
        <small>Связка: проект → материал → утверждённая версия → сессия → asset.</small>
        <div className="creativeAssets">
         <b>Сохранённые исходники на этом iPhone: {localAssets.length}</b>
         {localAssets.map(asset=><p key={asset.id}>{asset.kind} · {asset.filename} · {(asset.bytes/1024/1024).toFixed(1)} МБ · ожидает Media QA</p>)}
         <p>Дальше: media QA → транскрипция → анализ дублей → rough cut → титры → мастер. Автоматический монтаж пока не запускается.</p>
        </div>
       </div>
      </>}
    </div>
   </>}
   {feedback&&<p role="status" className="creativeFeedback">{feedback}</p>}
   {error&&<p role="alert" className="creativeError">{error}</p>}
  </section>;
}
