import React,{useEffect,useRef,useState} from 'react';
import type {EditorialPost} from './personaEditorialModel';
import {reviewRenderedCarousel,type VisualOpinion,type VisualDimension} from './personaCarouselVisualReview';
const labels:Record<VisualDimension,string>={readability:'Читаемость',hierarchy:'Иерархия',composition:'Композиция',brandCoherence:'Стиль бренда',imageRelevance:'Соответствие изображения'};
export default function PersonaCarouselVisualReview({post}:{post:EditorialPost}){
 const [rows,setRows]=useState<VisualOpinion[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[completed,setCompleted]=useState(false);
 const active=useRef<AbortController|null>(null);
 useEffect(()=>()=>{active.current?.abort();active.current=null},[]);
 async function run(){
  if(active.current)return;
  const controller=new AbortController();active.current=controller;
  setRows([]);setError('');setCompleted(false);setBusy(true);
  try{
   await reviewRenderedCarousel(post,{signal:controller.signal,onSlide:r=>{if(active.current===controller)setRows(old=>[...old,r])}});
   if(active.current===controller)setCompleted(true);
  }catch(e){if(active.current===controller)setError(controller.signal.aborted?'Проверка остановлена. Частичные результаты не являются итогом.':e instanceof Error?e.message:String(e))}
  finally{if(active.current===controller){active.current=null;setBusy(false)}}
 }
 const revisionNeeded=rows.some(r=>r.status==='REVISION_SUGGESTED');
 return <section aria-label="Визуальная экспертиза готовых слайдов" data-testid="persona-carousel-visual-review">
  <h4>Визуальный критик Persona</h4>
  <p>Локальная модель оценивает реальные PNG текущей редакции. Это рекомендации, не утверждение автора. Проверка не сравнивает с личным банком референсов и не проверяет факты.</p>
  <button type="button" disabled={busy} onClick={()=>void run()}>{busy?'Проверяю слайды…':'Проверить оформление'}</button>
  {busy&&<button type="button" onClick={()=>active.current?.abort()}>Остановить получение результатов</button>}
  <p role="status">Проверено {rows.length} из {post.slides.length}{completed?(revisionNeeded?' · Предложены правки':' · Требуется авторская оценка'):''}</p>
  {error&&<p role="alert">{error}</p>}
  {rows.map(r=><details key={r.sha256+'-'+r.index} open={r.status==='REVISION_SUGGESTED'}>
   <summary>Слайд {r.index} · {r.status==='REVISION_SUGGESTED'?'Предложены правки':'Рекомендации'} · {r.model}</summary>
   <p>{r.summary}</p>
   <ul>{Object.entries(r.scores).map(([k,v])=><li key={k}>{labels[k as VisualDimension]}: {v}/5</li>)}</ul>
   {r.issues.map((i,n)=><p key={n}><strong>{labels[i.dimension]}:</strong> {i.observation} — {i.change}</p>)}
  </details>)}
 </section>;
}
