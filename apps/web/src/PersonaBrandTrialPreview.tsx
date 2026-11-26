import React,{useEffect,useRef,useState} from 'react';
import type {EditorialPost} from './personaEditorialModel';
import {renderEditorialSlide} from './personaEditorialMedia';

import {prepareCreativeFeedback,appendCreativeFeedback,loadCreativeFeedback,requestCreativeModelPatch,markCreativeFeedbackPrepared,type CreativeFeedback} from './personaCreativeFeedback';

export default function PersonaBrandTrialPreview({post,onChange}:{post:EditorialPost;onChange:(post:EditorialPost)=>void}){
 const [selected,setSelected]=useState(post.slides[0]?.id??'');
 const [comment,setComment]=useState('');
 const [records,setRecords]=useState<CreativeFeedback[]>([]);
 const [feedbackStatus,setFeedbackStatus]=useState('');
 useEffect(()=>{try{setRecords(loadCreativeFeedback(localStorage).filter(r=>r.postId===post.id))}catch(e){setFeedbackStatus(e instanceof Error?e.message:String(e))}},[post.id]);
 const [feedbackBusy,setFeedbackBusy]=useState(false);
 const active=useRef(true),latest=useRef(post),inFlight=useRef(false);latest.current=post;
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[]);
 async function submitFeedback(){
  if(inFlight.current)return;
  inFlight.current=true;setFeedbackBusy(true);
  const original=post;
  try{
   const result=prepareCreativeFeedback(post,selected,comment);
   setRecords(appendCreativeFeedback(localStorage,result.record).filter(r=>r.postId===post.id));
   setComment('');
   if(result.revised){onChange(result.revised);setFeedbackStatus('Новый заголовок передан в редактор; проверь PNG.');return}
   setFeedbackStatus('Локальная модель разбирает замечание…');
   const model=await requestCreativeModelPatch(original,selected,result.record.comment);
   if(!active.current)return;
   if(latest.current.id!==original.id||latest.current.revision!==original.revision){setFeedbackStatus('Проект изменился. Правка сохранена в журнале, но не применена к другой редакции.');return}
   if(model.revised){
    setRecords(markCreativeFeedbackPrepared(localStorage,result.record.id).filter(r=>r.postId===post.id));
    onChange(model.revised);
    setFeedbackStatus(model.message+'. Проверь новый PNG; утверждение сброшено.');
   }else setFeedbackStatus(model.message+'. Замечание сохранено, слайд не изменён.');
  }catch(e){if(active.current)setFeedbackStatus((e instanceof Error?e.message:String(e))+'. Если замечание записано, оно остаётся в журнале.')}
  finally{inFlight.current=false;if(active.current)setFeedbackBusy(false)}
 }
 const [images,setImages]=useState<string[]>([]);
 const [error,setError]=useState('');
 useEffect(()=>{
  let active=true;const urls:string[]=[];
  setImages([]);setError('');
  void (async()=>{
   try{
    for(const [i,s] of post.slides.entries()){
     const png=await renderEditorialSlide(post,s,i);
     if(!active)return;
     urls.push(URL.createObjectURL(png));setImages([...urls]);
    }
   }catch(e){if(active)setError(e instanceof Error?e.message:String(e))}
  })();
  return()=>{active=false;urls.forEach(u=>URL.revokeObjectURL(u))};
 },[post]);
 return <section aria-label="Готовые слайды бренд-теста" data-testid="persona-brand-trial-preview">
  <h4>Persona · пробный комплект Old Money</h4>
  <p>Локальные иллюстрации и точный PNG-рендер. Это новый пробный вариант, не копия внешнего эталона и не разрешение на публикацию.</p>
  <p role="status">Создано {images.length} из {post.slides.length} слайдов{error?' · ошибка':''}</p>
  {error&&<p role="alert">{error}</p>}
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:12}}>
   {images.map((url,i)=><img key={url} src={url} alt={'Слайд '+(i+1)} style={{width:'100%',height:'auto'}}/>)}
  </div>
  <fieldset>
   <legend>Творческая правка</legend>
   <label>Слайд <select value={selected} onChange={e=>setSelected(e.target.value)}>
    {post.slides.map((s,i)=><option key={s.id} value={s.id}>{i+1}</option>)}
   </select></label>
   <label>Что изменить<textarea maxLength={1500} value={comment} onChange={e=>setComment(e.target.value)} placeholder="Например: Заголовок: Как музыка предупреждает об опасности"/></label>
   <button type="button" disabled={feedbackBusy||!comment.trim()} onClick={()=>void submitFeedback()}>{feedbackBusy?'Обрабатываю…':'Передать правку Persona'}</button>
   <p>Persona использует локальную модель для текста, выбора из двух гарнитур, светлой/тёмной палитры, позиции и размера иллюстрации. Новые изображения и произвольные шрифты пока не поддерживаются. Неподдержанные замечания остаются в журнале.</p>
   {feedbackStatus&&<p role="status">{feedbackStatus}</p>}
   {records.length>0&&<details><summary>История замечаний ({records.length})</summary>{records.slice().reverse().map(r=><p key={r.id}>{r.slideId} · редакция {r.revision}: {r.comment} · {r.status==='pending'?'ожидает исполнения':'редакция подготовлена'}</p>)}</details>}
  </fieldset>
  <p>Проверка фактов и утверждение готового дизайна остаются обязательными для экспорта. Выше и ниже можно редактировать текст и оформление; предпросмотр пересобирается.</p>
 </section>;
}
