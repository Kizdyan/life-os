import React,{useState} from 'react';
import PersonaStoryReview from './PersonaStoryReview';
import type {PersonaStoryOutline} from './personaStoryMechanics';
import {
 FREE_TREND_SOURCES,addPersonaFreeReference,readPersonaFreeReferences,
 savePersonaFreeReferences,exportPersonaFreeReferences,withPersonaReferenceStory,
 type PersonaFreeReference,type PersonaReferenceCategory
} from './personaFreeResearch';
import './persona-free-trend-radar.css';

const categories:{value:PersonaReferenceCategory;label:string}[]=[
 {value:'acting',label:'Актёрство'},{value:'comedy',label:'Комедия / POV'},
 {value:'music',label:'Музыка'},{value:'visual',label:'Монтаж и визуал'},{value:'other',label:'Другое'}
];

/**
 * A zero-credit evidence inbox within the existing Persona workflow.
 * No API call, video scraping, upload or claim that a source was watched.
 */
export default function PersonaFreeTrendRadar({onCreateIdea}:{
 onCreateIdea?:(idea:{title:string;angle:string;referenceUrl:string;storyOutline?:PersonaStoryOutline})=>void;
}){
 const [items,setItems]=useState<PersonaFreeReference[]>(()=>readPersonaFreeReferences(localStorage));
 const [url,setUrl]=useState('');
 const [searchPhrase,setSearchPhrase]=useState('актёрские кинопробы');
 const [title,setTitle]=useState('');
 const [category,setCategory]=useState<PersonaReferenceCategory>('comedy');
 const [observation,setObservation]=useState('');
 const [watched,setWatched]=useState(false);
 const [message,setMessage]=useState('');
 const [selectedId,setSelectedId]=useState<string|null>(null);
 const [adaptation,setAdaptation]=useState('');
 const [newTitle,setNewTitle]=useState('');

 function persist(next:PersonaFreeReference[]){
  try{savePersonaFreeReferences(localStorage,next);setItems(next);return true}
  catch{setMessage('Не удалось сохранить библиотеку в браузере. Экспортируй доступные данные.');return false}
 }
 function add(e:React.FormEvent){
  e.preventDefault();
  try{
   const next=addPersonaFreeReference(items,{url,title,category,observation,
    status:watched?'human-reviewed':'link-only'},new Date().toISOString(),crypto.randomUUID());
   if(!persist(next))return;
   setUrl('');setTitle('');setObservation('');setWatched(false);
   setMessage('Ссылка сохранена локально. Оценки просмотров и удержания не выдумываются.');
  }catch(error){setMessage(error instanceof Error?error.message:'Не удалось сохранить ссылку.')}
 }
 function remove(id:string){if(persist(items.filter(x=>x.id!==id)))setMessage('Референс удалён только из локальной библиотеки.')}
 function exportJson(){
  const blob=new Blob([exportPersonaFreeReferences(items)],{type:'application/json'});
  const link=document.createElement('a'),href=URL.createObjectURL(blob);
  link.href=href;link.download='persona-free-references.json';document.body.append(link);link.click();link.remove();
  window.setTimeout(()=>URL.revokeObjectURL(href),1000);
  setMessage('Экспортировано в JSON. Никаких данных на сервер не отправлено.');
 }
 function createIdea(){
  if(!onCreateIdea){setMessage('Открой проект Persona, чтобы создать идею.');return}
  const title=newTitle.trim(),angle=adaptation.trim();
  if(title.length<3||angle.length<15){setMessage('Для собственной идеи нужны название и оригинальный замысел не короче 15 символов.');return}
  const reference=items.find(x=>x.id===selectedId);
  if(!reference){setMessage('Сначала выбери сохранённый референс.');return}
  onCreateIdea({title,angle,referenceUrl:reference.url});
  setSelectedId(null);setAdaptation('');setNewTitle('');
 }
 function saveStory(id:string,story:PersonaStoryOutline){
  const updated=withPersonaReferenceStory(items,id,story);
  persist(updated);
 }
 function createStructuredIdea(reference:PersonaFreeReference,angle:string,storyOutline:PersonaStoryOutline){
  if(!onCreateIdea){setMessage('Создание проекта недоступно.');return}
  const title=newTitle.trim();
  if(title.length<3){setMessage('Сначала укажи название своей идеи.');return}
  onCreateIdea({title,angle,referenceUrl:reference.url,storyOutline});
  setSelectedId(null);setNewTitle('');setAdaptation('');
 }
 return <section className="personaFreeRadar" aria-label="Бесплатная разведка трендов">
  <header><div><small>ZERO-CREDIT · БЕЗ ПЛАТНЫХ API</small><h3>Источники трендов и референсы</h3><p>Открывай бесплатные публичные источники, сохраняй ссылки и наблюдения. Это ручное исследование: Persona не заявляет о просмотре видео, если ты его не смотрел.</p></div></header>
  <div className="radarSearch">
   <label>Тема бесплатного поиска<input aria-label="Тема трендов" value={searchPhrase} maxLength={100} onChange={e=>setSearchPhrase(e.target.value)} placeholder="Например: актёрские кинопробы"/></label>
   <div className="radarSearchLinks">
    <a target="_blank" rel="noopener noreferrer" href={'https://www.youtube.com/results?search_query='+encodeURIComponent(searchPhrase+' shorts')}>Искать YouTube ↗</a>
    <a target="_blank" rel="noopener noreferrer" href={'https://www.google.com/search?q='+encodeURIComponent('site:instagram.com/reel/ '+searchPhrase)}>Искать Reels ↗</a>
   </div>
   <small>Поиск открывается на площадке, без ключей и API-кредитов. Persona не получает автоматически историю просмотров или статистику выдачи.</small>
  </div>
  <details className="freeSources"><summary>Открыть источники трендов · {FREE_TREND_SOURCES.length}</summary>
   <div className="freeRadarSources">{FREE_TREND_SOURCES.map(source=><article key={source.name}>
    <a href={source.url} target="_blank" rel="noopener noreferrer">{source.name} ↗</a>
    <p>{source.detail}</p>
   </article>)}</div>
   <p className="radarCaution">Открытые страницы не гарантируют бесплатность отдельных шаблонов, полноту выдачи или доступность материалов в твоём регионе.</p>
  </details>
  <form onSubmit={add} className="freeRadarForm">
   <label>Ссылка на ролик / шаблон<input aria-label="Ссылка на референс" type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://www.instagram.com/reel/…" required/></label>
   <label>Название<input aria-label="Название референса" value={title} onChange={e=>setTitle(e.target.value)} maxLength={150} placeholder="Что именно нашёл" required/></label>
   <label>Направление<select aria-label="Направление референса" value={category} onChange={e=>setCategory(e.target.value as PersonaReferenceCategory)}>{categories.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
   <label>Что полезного заметил<textarea aria-label="Наблюдение по референсу" value={observation} onChange={e=>setObservation(e.target.value)} maxLength={1200} placeholder="Хук, поворот, актёрская задача, монтаж; если не смотрел — оставь пустым"/></label>
   <label className="radarCheck"><input type="checkbox" checked={watched} onChange={e=>setWatched(e.target.checked)}/> Я лично посмотрел материал и описал наблюдение</label>
   <button type="submit">Сохранить референс</button>
  </form>
  {message&&<p role="status" className="radarMessage">{message}</p>}
  <div className="radarSavedHead"><strong>Мои референсы · {items.length}</strong><button type="button" disabled={!items.length} onClick={exportJson}>Экспорт JSON</button></div>
  {items.length===0?<p className="radarEmpty">Пока нет ссылок. Начни с бесплатных источников выше. Здесь не показываются выдуманные просмотры или «тренды».</p>:
   <div className="radarSaved">{items.map(item=><article key={item.id}>
    <div className="radarSavedTitle"><a href={item.url} target="_blank" rel="noopener noreferrer">{item.title} ↗</a><small>{item.status==='human-reviewed'?'Лично просмотрено':'Только ссылка'} · {categories.find(c=>c.value===item.category)?.label}</small></div>
    {item.observation&&<p>{item.observation}</p>}
    <div className="radarActions"><button type="button" onClick={()=>{setSelectedId(item.id);setNewTitle('');setAdaptation('')}}>Создать оригинальную идею</button><button type="button" onClick={()=>remove(item.id)}>Удалить</button></div>
    {selectedId===item.id&&<div className="radarAdapt">
     <p>Используй приём, но не копируй сюжет. Идея перейдёт в существующий проект Persona и не будет автоматически одобрена.</p>
     <label>Название своей идеи<input aria-label="Название собственной идеи" value={newTitle} onChange={e=>setNewTitle(e.target.value)} maxLength={150}/></label>
     <label>Собственный сюжет / новая ситуация<textarea aria-label="Оригинальный замысел" value={adaptation} onChange={e=>setAdaptation(e.target.value)} maxLength={1000}/></label>
     <button type="button" onClick={createIdea} disabled={!onCreateIdea}>Создать проект Persona из краткого замысла</button>
     <details><summary>Подробный разбор драматургии · без AI-кредитов</summary>
      <PersonaStoryReview key={item.id} initial={item.storyOutline}
       referenceStatus={item.status} onChange={story=>saveStory(item.id,story)}
       onCreate={(angle,outline)=>createStructuredIdea(item,angle,outline)}/>
     </details>
    </div>}
   </article>)}</div>}
  <p className="radarCaution">Без платных AI-кредитов. Локальное хранилище браузера: используй экспорт как резервную копию. Автоматического исследования содержания и художественного QA пока нет.</p>
 </section>;
}
