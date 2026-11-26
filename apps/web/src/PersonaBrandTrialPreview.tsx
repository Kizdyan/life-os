import React,{useEffect,useState} from 'react';
import type {EditorialPost} from './personaEditorialModel';
import {renderEditorialSlide} from './personaEditorialMedia';

import {prepareCreativeFeedback,appendCreativeFeedback,loadCreativeFeedback,type CreativeFeedback} from './personaCreativeFeedback';

export default function PersonaBrandTrialPreview({post,onChange}:{post:EditorialPost;onChange:(post:EditorialPost)=>void}){
 const [selected,setSelected]=useState(post.slides[0]?.id??'');
 const [comment,setComment]=useState('');
 const [records,setRecords]=useState<CreativeFeedback[]>([]);
 const [feedbackStatus,setFeedbackStatus]=useState('');
 useEffect(()=>{try{setRecords(loadCreativeFeedback(localStorage).filter(r=>r.postId===post.id))}catch(e){setFeedbackStatus(e instanceof Error?e.message:String(e))}},[post.id]);
 function submitFeedback(){
  try{
   const result=prepareCreativeFeedback(post,selected,comment);
   setRecords(appendCreativeFeedback(localStorage,result.record).filter(r=>r.postId===post.id));
   if(result.revised){onChange(result.revised);setFeedbackStatus('Предложенная редакция передана в редактор; проверь новый PNG. Утверждение сброшено.')}
   else setFeedbackStatus('Замечание сохранено. Автоматическая художественная правка этого типа пока не подключена.');
   setComment('');
  }catch(e){setFeedbackStatus(e instanceof Error?e.message:String(e))}
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
   <button type="button" disabled={!comment.trim()} onClick={submitFeedback}>Передать правку Persona</button>
   <p>Пока автоматически поддерживается явная замена заголовка; другие замечания сохраняются без имитации исполнения.</p>
   {feedbackStatus&&<p role="status">{feedbackStatus}</p>}
   {records.length>0&&<details><summary>История замечаний ({records.length})</summary>{records.slice().reverse().map(r=><p key={r.id}>{r.slideId} · редакция {r.revision}: {r.comment} · {r.status==='pending'?'ожидает исполнения':'редакция подготовлена'}</p>)}</details>}
  </fieldset>
  <p>Проверка фактов и утверждение готового дизайна остаются обязательными для экспорта. Выше и ниже можно редактировать текст и оформление; предпросмотр пересобирается.</p>
 </section>;
}
