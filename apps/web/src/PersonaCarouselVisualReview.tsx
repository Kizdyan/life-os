import React,{useEffect,useRef,useState} from 'react';
import {personaWorkerUrl} from './personaWorkerUrl';
import type {EditorialPost} from './personaEditorialModel';
import {improveCarouselDraft,type ImprovementAttempt} from './personaCarouselSelfImprove';
import {isLocalBrandTrialSlide} from './personaJawsBrandTrial';
import {renderEditorialSlide,triggerEditorialDownload} from './personaEditorialMedia';
import {reviewRenderedCarousel,type VisualOpinion,type VisualDimension} from './personaCarouselVisualReview';
const labels:Record<VisualDimension,string>={readability:'Читаемость',hierarchy:'Иерархия',composition:'Композиция',brandCoherence:'Стиль бренда',imageRelevance:'Соответствие изображения'};
export default function PersonaCarouselVisualReview({post,onChange}:{post:EditorialPost;onChange:(post:EditorialPost)=>void}){
 const [rows,setRows]=useState<VisualOpinion[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[completed,setCompleted]=useState(false);
 const [candidate,setCandidate]=useState<EditorialPost|null>(null),[attempts,setAttempts]=useState<ImprovementAttempt[]>([]);
 const [remaining,setRemaining]=useState<number[]>([]);
 const [previews,setPreviews]=useState<{index:number;before:string;after:string}[]>([]);
 const canImprove=!post.approvals.design&&post.slides.every(s=>isLocalBrandTrialSlide(post,s));
 useEffect(()=>{
  let alive=true;const urls:string[]=[];setPreviews([]);
  if(candidate)void(async()=>{
   try{
    const next=[];
    for(const [i,s] of post.slides.entries()){
     if(JSON.stringify(s)===JSON.stringify(candidate.slides[i]))continue;
     const a=await renderEditorialSlide(post,s,i),b=await renderEditorialSlide(candidate,candidate.slides[i],i);
     const receipt=attempts.find(r=>r.index===i+1&&r.accepted);
     const sha=async(blob:Blob)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))).map(b=>b.toString(16).padStart(2,'0')).join('');
     if(!receipt?.after||await sha(a)!==receipt.before.sha256||await sha(b)!==receipt.after.sha256)throw Error('PNG изменились после проверки. Повтори экспертизу.');
     if(!alive)return;
     const before=URL.createObjectURL(a),after=URL.createObjectURL(b);urls.push(before,after);next.push({index:i+1,before,after});
    }
    if(alive)setPreviews(next);
   }catch(e){if(alive)setError(e instanceof Error?e.message:String(e))}
  })();
  return()=>{alive=false;urls.forEach(u=>URL.revokeObjectURL(u))};
 },[post,candidate,attempts]);
 const active=useRef<AbortController|null>(null);
 const [indexBusy,setIndexBusy]=useState(false),[indexMessage,setIndexMessage]=useState('');
 const indexLock=useRef(false);
 const indexStop=useRef(false);
 useEffect(()=>()=>{indexStop.current=true},[]);
 async function indexNext(){
  if(indexLock.current||active.current)return;
  indexLock.current=true;indexStop.current=false;setIndexBusy(true);setIndexMessage('Начинаю анализ банка…');
  let analyzed=0,errors=0;
  try{
   const h=await fetch(personaWorkerUrl+'/health',{cache:'no-store',signal:AbortSignal.timeout(5000)});
   if(!h.ok)throw Error('Worker недоступен');
   const health=await h.json();if(health.service!=='persona-media-worker'||typeof health.token!=='string')throw Error('Worker не подтверждён');
   for(let i=0;i<20&&!indexStop.current;i++){
    const r=await fetch(personaWorkerUrl+'/reference-intelligence/index',{method:'POST',headers:{'Content-Type':'application/json','X-Persona-Worker-Token':health.token},body:JSON.stringify({limit:1}),signal:AbortSignal.timeout(210000)});
    const data=await r.json();
    if(!r.ok)throw Error(typeof data.error==='string'?data.error:'Ошибка индекса');
    if(!Number.isInteger(data.analyzed)||!Number.isInteger(data.reused)||!Number.isInteger(data.remaining)||!Number.isInteger(data.blocked)||!Array.isArray(data.errors))throw Error('Некорректный отчёт индекса');
    analyzed+=data.analyzed;errors+=data.errors.length;
    setIndexMessage('За сеанс изучено: '+analyzed+'; в индексе: '+(data.reused+data.analyzed)+'; осталось: '+data.remaining+'; заблокировано: '+data.blocked+'; ошибок за сеанс: '+errors+'.');
    if(data.remaining===0)break;
   }
   if(indexStop.current)setIndexMessage(s=>s+' Остановлено после текущего кадра.');
  }catch(e){setIndexMessage(e instanceof Error?e.message:String(e))}
  finally{indexLock.current=false;setIndexBusy(false)}
 }
 useEffect(()=>()=>{active.current?.abort();active.current=null},[]);
 async function run(improve=false){
  if(active.current||indexLock.current)return;
  const controller=new AbortController();active.current=controller;
  setRows([]);setError('');setCompleted(false);setBusy(true);setCandidate(null);setAttempts([]);setRemaining([]);
  try{
   const onBaseline=(r:VisualOpinion)=>{if(active.current===controller)setRows(old=>[...old,r])};
   if(improve){
    const result=await improveCarouselDraft(post,{signal:controller.signal,onBaseline,onAttempt:r=>{if(active.current===controller)setAttempts(old=>[...old,r])}});
    if(active.current===controller){setCandidate(result.candidate);setRemaining(result.remaining)}
   }else await reviewRenderedCarousel(post,{signal:controller.signal,onSlide:onBaseline});
   if(active.current===controller)setCompleted(true);
  }catch(e){if(active.current===controller)setError(controller.signal.aborted?'Проверка остановлена. Частичные результаты не являются итогом.':e instanceof Error?e.message:String(e))}
  finally{if(active.current===controller){active.current=null;setBusy(false)}}
 }
 const revisionNeeded=rows.some(r=>r.status==='REVISION_SUGGESTED');
 return <section aria-label="Визуальная экспертиза готовых слайдов" data-testid="persona-carousel-visual-review">
  <h4>Визуальный критик Persona</h4>
  <p>Локальная модель оценивает реальные PNG текущей редакции. Это рекомендации, не утверждение автора. Если настроен локальный банк, модель получает до двух релевантных кадров. Это не утверждённые предпочтения и не фактчекинг.</p>
  <button type="button" disabled={busy||indexBusy} onClick={()=>void indexNext()}>Анализировать банк (до 20 новых кадров)</button>
  {indexBusy&&<button type="button" onClick={()=>{indexStop.current=true}}>Остановить после текущего кадра</button>}
  {indexMessage&&<p role="status">{indexMessage}</p>}
  <button type="button" disabled={busy||indexBusy} onClick={()=>void run()}>{busy?'Проверяю слайды…':'Проверить оформление'}</button>
  {canImprove&&<button type="button" disabled={busy||indexBusy} onClick={()=>void run(true)}>Проверить и улучшить автоматически (до 3 попыток)</button>}
  {busy&&<button type="button" onClick={()=>active.current?.abort()}>Остановить получение результатов</button>}
  <p role="status">Проверено {rows.length} из {post.slides.length}{completed?(revisionNeeded?' · Предложены правки':' · Требуется авторская оценка'):''}</p>
  {error&&<p role="alert">{error}</p>}
  {attempts.map(a=><p key={a.index}>Попытка · слайд {a.index}: {a.accepted?'кандидат улучшен':'исходный вариант сохранён'} · {a.reason}</p>)}
  {remaining.length>0&&<p>Требуют дополнительной работы: слайды {remaining.join(', ')}.</p>}
  {candidate&&<div>
   <h5>Предложенная редакция</h5>
   <p>Исходный проект не изменён. Ни факты, ни подпись, ни авторские утверждения не менялись. Оценка кандидата не доказывает художественное превосходство.</p>
   {previews.map(p=><div key={p.index}><strong>Слайд {p.index}</strong><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}><div>До<img src={p.before} alt={'До: слайд '+p.index} style={{width:'100%'}}/></div><div>После<img src={p.after} alt={'После: слайд '+p.index} style={{width:'100%'}}/></div></div></div>)}
   <button type="button" onClick={()=>triggerEditorialDownload(new Blob([JSON.stringify({original:post,candidate,attempts},null,2)],{type:'application/json'}),post.id+'-visual-comparison.json')}>Сохранить обе редакции и отчёт</button>
   <button type="button" disabled={!previews.length||Boolean(error)} onClick={()=>onChange(candidate)}>Принять редакцию в проект (не утверждение публикации)</button>
  </div>}
  {rows.map(r=><details key={r.sha256+'-'+r.index} open={r.status==='REVISION_SUGGESTED'}>
   <summary>Слайд {r.index} · {r.status==='REVISION_SUGGESTED'?'Предложены правки':'Рекомендации'} · {r.model}</summary>
   <p>{r.summary}</p>
   <p>Кадров референсов: {r.referenceEvidence?.length??0}. {(r.referenceEvidence??[]).map(e=>e.assetSha256.slice(0,12)+' @ '+e.timeSec+' с').join(' · ')}</p>
   <ul>{Object.entries(r.scores).map(([k,v])=><li key={k}>{labels[k as VisualDimension]}: {v}/5</li>)}</ul>
   {r.issues.map((i,n)=><p key={n}><strong>{labels[i.dimension]}:</strong> {i.observation} — {i.change}</p>)}
  </details>)}
 </section>;
}
