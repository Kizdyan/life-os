import React,{useEffect,useState} from 'react';
import type {EditorialPost} from './personaEditorialModel';
import {renderEditorialSlide} from './personaEditorialMedia';

export default function PersonaBrandTrialPreview({post}:{post:EditorialPost}){
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
  <p>Проверка фактов и утверждение готового дизайна остаются обязательными для экспорта. Выше и ниже можно редактировать текст и оформление; предпросмотр пересобирается.</p>
 </section>;
}
