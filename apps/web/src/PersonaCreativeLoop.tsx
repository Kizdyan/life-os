import { useCallback, useEffect, useRef, useState } from "react";
import type { CreativeItem } from "../../../supabase/functions/life-os-runtime-prototype-v3/persona-creative-core";
import { personaEdgeRequest } from "./edgeRuntimeClient";
import { createMediaMetadata, listCapturedAssets, persistCapturedAsset, type CreativeMediaMetadata } from "./personaMediaIntake";
import { roleLabel, type MediaOverride } from "./personaMediaRoles";
import "./persona-creative-v1.css";

type ViewItem = CreativeItem & {verifiedFreshness:"cached"|"stale"|"unverified"};
type Stage = "idea"|"edit"|"shoot"|"upload"|"assembly";
type Api = Record<string, any>;
const STAGES:ReadonlyArray<{id:Stage;label:string}> = [
  {id:"idea",label:"Идея"},{id:"edit",label:"Правки"},
  {id:"shoot",label:"Съёмка"},{id:"upload",label:"Материалы"},
  {id:"assembly",label:"Монтаж"}
];
const NAV_KEY="persona:creative:v1:navigation";
const str=(value:unknown)=>typeof value==="string"?value:"";
const niceError=(error:unknown)=>{
 const message=error instanceof Error?error.message:String(error);
 if(message.includes("revision_conflict"))return "Идея обновилась. Открой её снова и попробуй ещё раз.";
 if(message.includes("revision_pending"))return "Сначала реши, принять ли предложенную правку.";
 if(message.includes("approval_not_current"))return "Изменённый текст нужно утвердить заново.";
 return "Не получилось выполнить действие. "+message.slice(0,130);
};
function initialNavigation():{id:string;stage:Stage}{
 try {
  const saved=JSON.parse(sessionStorage.getItem(NAV_KEY)||"{}");
  const stage=STAGES.find(x=>x.id===saved.stage)?.id||"idea";
  return {id:typeof saved.id==="string"?saved.id:"",stage};
 } catch {return {id:"",stage:"idea"};}
}
export default function PersonaCreativeLoop(){
 const [navigation,setNavigation]=useState(initialNavigation);
 const [items,setItems]=useState<ViewItem[]>([]);
 const [instruction,setInstruction]=useState("");
 const [conditions,setConditions]=useState("");
 const [editorOpen,setEditorOpen]=useState(false);
 const [roleOverride,setRoleOverride]=useState<MediaOverride>("auto");
 const [localAssets,setLocalAssets]=useState<CreativeMediaMetadata[]>([]);
 const [busy,setBusy]=useState(false);
 const [loaded,setLoaded]=useState(false);
 const [error,setError]=useState("");
 const [feedback,setFeedback]=useState("");
 const [erikaAssessment,setErikaAssessment]=useState("");
 const [justApplied,setJustApplied]=useState(false);
 const responseRef=useRef<HTMLElement|null>(null);
 const refresh=useCallback(async(seed=false)=>{
   const response=await personaEdgeRequest({action:seed?"creative_shortlist":"creative_state"}) as {items?:ViewItem[]};
   const safe=Array.isArray(response.items)?response.items.slice(0,3):[];
   setItems(safe);
   return safe;
 },[]);
 useEffect(()=>{
  let active=true;
  // Safari can transiently lose a request on Wi-Fi handover. Bounded retry is
  // internal; never invent ideas or bypass approval when the Edge really fails.
  void (async()=>{
   let failure:unknown=null;
   for(let attempt=0;attempt<3&&active;attempt++){
    try{
     const candidates=await refresh(true);
     if(candidates.length>0){if(active){setError("");setLoaded(true)}return;}
     failure=new Error("empty_creative_shortlist");
    }catch(e){failure=e;}
    if(attempt<2)await new Promise<void>(resolve=>setTimeout(resolve,300*(attempt+1)));
   }
   if(active){setError(niceError(failure));setLoaded(true);}
  })();
  return ()=>{active=false};
 },[refresh]);
 useEffect(()=>{
  try{sessionStorage.setItem(NAV_KEY,JSON.stringify(navigation));}catch{/* private browsing */}
 },[navigation]);
 const item=items.find(x=>x.id===navigation.id);
 const revision=item?.revisions.find(x=>x.version===item.currentVersion);
 const idea=revision?.idea;
 const actionable=item?.verifiedFreshness==="cached"&&!item.pending&&!!revision?.proof;
 const session=item?.session&&item.session.ideaVersion===item.currentVersion?item.session:null;
 const previous=item?.revisions.find(x=>x.version===item.currentVersion-1);
 const stage:Stage=!item?"idea":
  !session&&["shoot","upload","assembly"].includes(navigation.stage)?"edit":navigation.stage;
 const stepIndex=STAGES.findIndex(x=>x.id===stage);
 const canVisit=(index:number)=>index===0||(!!item&&(index===1||((index===2||index===3)&&!!session)
   ||(index===4&&!!session&&localAssets.length>0)));
 const changeStage=(next:Stage)=>{
  setNavigation(nav=>({id:nav.id,stage:next}));
  setFeedback("");setError("");
  requestAnimationFrame(()=>window.scrollTo({top:0,behavior:"auto"}));
 };
 // iOS WebKit can report an action as visible while Safari chrome or the
 // fixed app footer still occupies its tap area. Keep the active action clear
 // of whichever boundary is higher, including while a focused field hides nav.
 useEffect(()=>{
  const selector:Partial<Record<Stage,string>>={
    shoot:conditions.trim()?".creativeAdjust:not(:disabled)":".creativeShooting>.creativeTake",
    upload:".creativeUploadStage>.creativePicker",
    assembly:".creativeAssembly>.creativeTake"
  };
  const targetSelector=selector[stage];if(!targetSelector)return;
  const frame=requestAnimationFrame(()=>{
   const action=document.querySelector<HTMLElement>(targetSelector);
   if(!action)return;
   const footer=document.querySelector<HTMLElement>("main > .mainNav");
   const footerVisible=!!footer&&getComputedStyle(footer).display!=="none";
   const visual=window.visualViewport;
   const viewportTop=visual?.offsetTop??0;
   const viewportBottom=viewportTop+(visual?.height??window.innerHeight);
   const footerTop=footerVisible?footer!.getBoundingClientRect().top:viewportBottom;
   const root=action.closest<HTMLElement>(".creativeV1");
   const rootStyle=root?getComputedStyle(root):null;
   const clearance=parseFloat(rootStyle?.getPropertyValue("--creative-action-clearance")||"")||16;
   const safeInset=footerVisible?0:
    parseFloat(rootStyle?.getPropertyValue("--creative-safe-bottom")||"")||0;
   const safeBoundary=Math.min(viewportBottom,footerTop)-clearance-safeInset;
   const actionBox=action.getBoundingClientRect();
   if(actionBox.top>=viewportTop&&actionBox.top<viewportBottom&&actionBox.bottom>safeBoundary){
    window.scrollBy({top:actionBox.bottom-safeBoundary,behavior:"auto"});
   }
  });
  return ()=>cancelAnimationFrame(frame);
 },[stage,session?.briefVersion,localAssets.length,conditions]);
 useEffect(()=>{
  if(!session){setLocalAssets([]);return;}
  let active=true;
  void listCapturedAssets(session.id).then(xs=>{if(active)setLocalAssets(xs)})
   .catch(()=>{if(active)setError("Не удалось прочитать сохранённые файлы.")});
  return ()=>{active=false};
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
 const choose=(id:string)=>{
  setNavigation({id,stage:"edit"});setInstruction("");setEditorOpen(false);
  setErikaAssessment("");setJustApplied(false);setConditions("");setFeedback("");setError("");
 };
 async function discuss(){
  if(!item||!instruction.trim()||busy)return;
  setErikaAssessment("Эрика оценивает правку…");setJustApplied(false);
  const answer=await act({action:"creative_edit",ideaId:item.id,baseVersion:item.currentVersion,instruction});
  if(answer){
   setErikaAssessment(str(answer.critic));
   setInstruction("");
   if(!answer.proposedVersion)setEditorOpen(false);
   requestAnimationFrame(()=>responseRef.current?.scrollIntoView({block:"nearest",behavior:"smooth"}));
  }else setErikaAssessment("");
 }
 async function approve(){
  if(!item||busy)return;
  const answer=await act({action:"creative_approve",ideaId:item.id,expectedVersion:item.currentVersion});
  if(answer?.approved){
   setJustApplied(true);setErikaAssessment("");setEditorOpen(false);setInstruction("");
   setFeedback("Правка применена. Эрика повторно проверила новую редакцию.");
   setConditions("");
  }
 }
 async function discard(){
  if(!item)return;
  const result=await act({action:"creative_discard_proposal",ideaId:item.id,baseVersion:item.currentVersion});
  if(result){setErikaAssessment("Оставляем прежний вариант.");setEditorOpen(false)}
 }
 async function startShooting(adapt=false){
  if(!item||!revision||!actionable)return;
  const result=await act({action:adapt?"creative_adapt_brief":"creative_start_session",
   ideaId:item.id,version:item.currentVersion,approvalProof:revision.proof,conditions});
  if(adapt&&document.activeElement instanceof HTMLElement)document.activeElement.blur();
  if(result?.session){if(!adapt)changeStage("shoot");else setFeedback("Съёмка подстроена под твои условия.");}
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
    try{
     const answer=await personaEdgeRequest({action:"creative_register_asset",
      ideaId:item.id,version:item.currentVersion,approvalProof:revision.proof,asset:meta});
     if(answer.registered)registered++;
    }catch{/* Local binary remains committed; never claim the cloud contains files. */}
   }
   await refresh();
   setFeedback("Загружено "+stored+" файл(ов) на этом iPhone."+
    (registered<stored?" Некоторые сведения о файлах ещё не синхронизированы.":""));
  }catch(e){setError(niceError(e));}
  finally{setBusy(false)}
 }
 return <section className="creativeV1" aria-label="Persona Creative Loop V1" data-stage={stage}>
  <nav className="creativeProgress" aria-label="Этапы создания ролика">
   {STAGES.map((step,index)=><button type="button" key={step.id} className={index===stepIndex?"current":""}
    aria-current={index===stepIndex?"step":undefined} disabled={busy||!canVisit(index)}
    onClick={()=>changeStage(step.id)}>
    <span className="creativeStepDot" aria-hidden="true">{index<stepIndex?"✓":index+1}</span>
    <span>{step.label}</span>
   </button>)}
  </nav>
  {!loaded?<p role="status" className="creativeSimpleStatus">Готовлю идеи…</p>:null}
  {loaded&&items.length===0?<p role="status" className="creativeSimpleStatus">Пока нет идей, которые прошли проверку.</p>:null}
  {stage==="idea"&&<section className="creativeStage" aria-label="Идея">
   <div className="creativeStageHead"><small>ШАГ 1 · ИДЕЯ</small><h2>Что снимем?</h2></div>
   <div className="creativeShortlist">
    {items.map((entry,index)=>{
     const concept=entry.revisions.find(x=>x.version===entry.currentVersion)?.idea||{};
     return <article className="creativeIdea" key={entry.id}>
      <small>{index===0?"РЕКОМЕНДУЮ":`ВАРИАНТ ${index+1}`}</small>
      <h3>{str(concept.title)}</h3>
      <p className="creativeHook"><b>Хук</b>{str(concept.hook)}</p>
      <p className="creativeOneLine"><b>Что снять</b>{str(concept.soloPlan)||str(concept.angle)}</p>
      <p className="creativeTime">Примерно {String(concept.estimatedMinutes||"—")} мин.</p>
      <button className="primary creativeSelect" disabled={busy||entry.verifiedFreshness!=="cached"}
       onClick={()=>choose(entry.id)}>Выбрать</button>
      <details className="creativeDetails"><summary>Подробнее</summary>
       <p><b>Почему подходит:</b> {str(concept.reason)}</p>
       <p>Формат: {str(concept.format)}</p><p>Редакция {entry.currentVersion} · {str(entry.verifiedFreshness)}</p>
       <p>Рекомендации платформ по формату, не доказательство тренда · уверенность {String(concept.confidence??"—")}%</p>
      </details>
     </article>;
    })}
   </div>
  </section>}
  {stage==="edit"&&item&&revision&&<section className="creativeStage creativeEdit" aria-label="Правки">
   <div className="creativeStageHead"><small>ШАГ 2 · ПРАВКИ</small><h2>{str(idea?.title)}</h2></div>
   <div className="creativeDirection">
    <p><b>Что сказать</b>{str(idea?.script)}</p>
    <p><b>Что снять</b>{str(idea?.soloPlan)||str(idea?.angle)}</p>
   </div>
   {item.pending?<div ref={responseRef} className="creativeProposal" role="status">
    <h3>Эрика предлагает</h3>
    <p><b>Предлагаю</b>{str(item.pending.idea.script)}</p>
    {str(item.pending.idea.hook)!==str(idea?.hook)&&<p><b>Начало</b>{str(item.pending.idea.hook)}</p>}
    <p className="creativeOpinion"><b>Моё мнение</b>{item.pending.critic}</p>
    <button className="primary creativeApply" disabled={busy||item.pending.status!=="APPROVE"}
     onClick={()=>void approve()}>Применить</button>
    <button className="creativeSecondary" disabled={busy} onClick={()=>void discard()}>Оставить как было</button>
    <details className="creativeDetails"><summary>Сравнить с исходником</summary>
     <p>{str(idea?.script)}</p>
    </details>
   </div>:<>
    {justApplied&&<div className="creativeApplied" role="status">
     <strong>✓ Правка применена</strong>
     <p>Что изменилось: {str(revision.reason)}</p>
     {previous&&<details className="creativeDetails"><summary>Было / стало</summary>
      <p><b>Было:</b> {str(previous.idea.script)}</p><p><b>Стало:</b> {str(idea?.script)}</p>
     </details>}
    </div>}
    {erikaAssessment&&<p ref={responseRef} className="creativeErikaReply" role="status">
      <b>Эрика</b>{erikaAssessment}
    </p>}
    {!editorOpen?<button className="creativeErikaLaunch" onClick={()=>setEditorOpen(true)}>
      <span aria-hidden="true">✦</span> Обсудить с Эрикой <span aria-hidden="true">→</span>
    </button>:<div className="creativeConversation">
     <label htmlFor="creative-erika-input">Что хочешь изменить?</label>
     <textarea id="creative-erika-input" rows={3} value={instruction} onChange={e=>setInstruction(e.target.value)}
      placeholder="Сделай финал смешнее. А может, лучше оставить как есть?"/>
     <button className="primary creativeDiscuss" disabled={busy||!instruction.trim()} onClick={()=>void discuss()}>
      {busy?"Эрика думает…":"Обсудить с Эрикой"}
     </button>
     <button className="creativeSecondary" onClick={()=>{setEditorOpen(false);setInstruction("")}}>Закрыть</button>
    </div>}
    {!editorOpen&&<button className="primary creativeTake" disabled={busy||!actionable} onClick={()=>void startShooting()}>
     Берём — к съёмке <span aria-hidden="true">→</span>
    </button>}
   </>}
   <details className="creativeDetails"><summary>Подробнее · история правок</summary>
    {item.revisions.map(r=><p key={r.version}>Редакция {r.version}: {r.reason} · {r.judge}</p>)}
   </details>
  </section>}
  {stage==="shoot"&&item&&session&&<section className="creativeStage creativeShooting" aria-label="Съёмка">
   <div className="creativeStageHead"><small>ШАГ 3 · СЪЁМКА</small><h2>Сними ролик</h2></div>
   <div className="creativeBrief" aria-label="Краткое съёмочное задание">
    <p className="creativeHeroInstruction"><b>Что делать</b>{str(idea?.soloPlan)||str(idea?.angle)}</p>
    <p className="creativeSpoken"><b>Что сказать</b>{str(idea?.script)}</p>
    {Array.isArray(session.brief.shots)&&session.brief.shots.slice(0,1).map((shot:any)=><div key={shot.id} className="creativeShootGrid">
     <p><b>Куда поставить iPhone</b>{str(shot.cameraPosition)}</p>
     <p><b>Свет</b>{str(session.brief.lighting)}</p>
     <p><b>Дублей</b>{String(shot.takes||2)}</p>
     <p><b>Секунд</b>{String(shot.durationSeconds||25)}</p>
    </div>)}
   </div>
   <button className="primary creativeTake" onClick={()=>changeStage("upload")}>Я снял — загрузить материалы →</button>
   <details className="creativeDetails"><summary>Подробнее · кадр и настройки</summary>
    {Array.isArray(session.brief.shots)&&session.brief.shots.map((shot:any)=>
      <p key={shot.id}><b>{str(shot.purpose)}</b> · Кадр: {str(shot.composition)} · {str(shot.action)}</p>)}
    <p>Звук: {str(session.brief.audio)} · Фон: {str(session.brief.background)}</p>
   </details>
   <details className="creativeDetails"><summary>Изменить условия съёмки</summary>
    <label htmlFor="creative-conditions">Что изменилось?</label>
    <textarea id="creative-conditions" rows={2} value={conditions} onChange={e=>setConditions(e.target.value)}
     placeholder="Снимаю один, нет штатива, плохой свет, есть 7 минут."/>
    <p className="creativeAdjustHint" role="status">
      {conditions.trim()?"Условия описаны — теперь можно применить.":"Напиши, что изменилось — кнопка станет активной."}
    </p>
    <button className="creativeAdjust" type="button" disabled={busy||!actionable||!conditions.trim()}
      aria-describedby="creative-adjust-reason" onClick={()=>void startShooting(true)}>
      {busy?"Подстраиваю съёмку…":"Подстроить съёмку"}
    </button>
    <span id="creative-adjust-reason" className="creativeVisuallyHidden">
      {conditions.trim()?"Условия готовы к применению":"Сначала опиши условия в поле выше"}
    </span>
   </details>
  </section>}
  {stage==="upload"&&item&&session&&<section className="creativeStage creativeUploadStage" aria-label="Материалы">
   <div className="creativeStageHead"><small>ШАГ 4 · МАТЕРИАЛЫ</small><h2>Загрузить материалы</h2>
    <p>Выбери записи. Persona сама разберёт, где дубли, фото и звук.</p></div>
   {localAssets.length>0&&<div className="creativeUploadStatus" role="status">
    <b>✓ Загружено {localAssets.length} файлов</b>
    <p>Анализ дублей — следующий этап. Лучший дубль пока не определён.</p>
   </div>}
   <label className="creativePicker">Загрузить материалы
    <input aria-label="Загрузить материал" type="file" multiple accept="video/*,image/*,audio/*,.mov,.mp4,.m4a"
     disabled={busy} onChange={e=>{const picker=e.currentTarget;const files=Array.from(picker.files||[]);
      void upload(files).finally(()=>{picker.value=""});}}/>
   </label>
   {localAssets.length>0&&<button className="creativeNext" onClick={()=>changeStage("assembly")}>
    Перейти к монтажу →</button>}
   <details className="creativeDetails"><summary>Подробнее · мои материалы</summary>
    {localAssets.length===0?<p>Файлы ещё не добавлены.</p>:localAssets.map(asset=><p key={asset.id}>
     {roleLabel(asset.role||"reference_other")} · {asset.filename}</p>)}
    <p>Оригиналы пока сохраняются только на этом iPhone, не в облаке. Не удаляй данные сайта.</p>
    <label htmlFor="creative-upload-kind">Уточнить тип файлов вручную (необязательно)</label>
    <select id="creative-upload-kind" value={roleOverride} onChange={e=>setRoleOverride(e.target.value as MediaOverride)}>
     <option value="auto">Persona определит сама</option>
     <option value="primary_take">Основной дубль</option><option value="alternate_take">Другой дубль</option>
     <option value="broll">B-roll</option><option value="photo">Фото</option>
     <option value="audio">Отдельный звук</option><option value="reference_other">Референс / другое</option>
    </select>
   </details>
  </section>}
  {stage==="assembly"&&item&&<section className="creativeStage creativeAssembly" aria-label="Монтаж">
   <div className="creativeStageHead"><small>ШАГ 5 · МОНТАЖ</small><h2>Рекомендуемый монтаж</h2></div>
   <p className="creativeSimpleStatus">Монтаж ещё не собран. Анализ дублей и сборка видео появятся в следующем этапе Persona.</p>
   <details className="creativeDetails"><summary>Как будет работать монтаж</summary>
    <p>Persona сравнит дубли, выберет лучшие фрагменты, уберёт паузы,
       добавит субтитры, нормализует звук и подготовит вертикальное видео.</p>
    <p>Рекомендуемый монтаж и не более одной альтернативы. Решения: Берём / Изменить / Не берём.</p>
   </details>
   <button className="primary creativeTake" onClick={()=>changeStage("upload")}>Вернуться к материалам</button>
  </section>}
  {feedback&&<p className="creativeFeedback" role="status">{feedback}</p>}
  {error&&<p className="creativeError" role="alert">{error}</p>}
 </section>;
}
