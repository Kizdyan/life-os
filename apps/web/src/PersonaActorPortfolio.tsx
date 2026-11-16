import React,{useEffect,useState} from 'react';
import {personaLightingPlan} from '../../../packages/core/src/persona-lighting.mjs';
import {generateActorPortfolio,visualIdentityConfig,type ActorPortfolioProject} from '../../../packages/core/src/persona-arsenal.mjs';
import {ACTOR_PORTFOLIO_STORE,addActorPortfolio,readActorPortfolios,updateActorPortfolio} from './personaActorPortfolioStore';
import './persona-industry-portfolio.css';

const identity=visualIdentityConfig();
const duration=(start:number)=>String(Math.floor(start/60)).padStart(2,'0')+':'+String(start%60).padStart(2,'0');
const scriptText=(project:ActorPortfolioProject)=>[
 '# '+project.title,'','Художественная визитка · '+project.durationSec+' секунд',
 'Жанр: '+project.genre,'Конфликт: '+project.conflict,
 'Статус: сценарный и световой черновик, ожидает проверки автора',
 ...project.storyboard.flatMap(s=>['','## '+s.id+' · '+duration(s.startSec)+' · '+s.durationSec+' с',
  'Реплика: '+s.line,'Действие: '+s.action,'Камера: '+s.camera,
  'Крупность: '+s.framing,'Актёрская задача: '+s.performance,
  'Key: '+s.lighting.key,'Fill: '+s.lighting.fill,'Back: '+s.lighting.back]),
 '','Не является подтверждением съёмки, прав на музыку или готовности к публикации.'
].join('\n');

export default function PersonaActorPortfolio({onBack}:{onBack:()=>void}){
 const [title,setTitle]=useState('Художественная визитка · Проба');
 const [genre,setGenre]=useState<'drama'|'comedy'|'musical'>('drama');
 const [projects,setProjects]=useState<ActorPortfolioProject[]>([]);
 const [active,setActive]=useState<ActorPortfolioProject|null>(null);
 const [error,setError]=useState('');
 const [dirty,setDirty]=useState(false);
 useEffect(()=>{
  try{setProjects(readActorPortfolios(localStorage))}
  catch{setError('Каталог визиток повреждён. Исходная запись сохранена, перезапись заблокирована.')}
 },[]);
 function createProject(){
  try{
   const id='actor-'+crypto.randomUUID();
   const project=addActorPortfolio(localStorage,{id,title,genre});
   setProjects(readActorPortfolios(localStorage));setActive(project);setDirty(false);setError('');
  }catch(e){setError((e as Error).message)}
 }
 function editShot(id:string,field:'line'|'action',value:string){
  if(!active)return;
  const storyboard=active.storyboard.map(s=>s.id!==id?s:{
   ...s,[field]:value,
   ...(field==='action'?{lighting:personaLightingPlan(value+' '+(active.genre==='drama'?'драматичная сцена':active.genre==='musical'?'пианино':'юмористическая сцена'))}:{}),
  });
  setActive({...active,storyboard,script:storyboard.map(({id,line,action,durationSec})=>({id,line,action,durationSec})),updatedAt:new Date().toISOString()});
  setDirty(true);
 }
 function saveEdits(){
  if(!active)return;
  if(active.storyboard.some(s=>!s.line.trim()||!s.action.trim())){setError('Для каждого кадра нужны реплика и действие.');return}
  try{updateActorPortfolio(localStorage,active);setProjects(readActorPortfolios(localStorage));setDirty(false);setError('')}
  catch(e){setError((e as Error).message)}
 }
 function downloadSheet(){
  if(!active)return;
  const blob=new Blob([scriptText(active)],{type:'text/markdown;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');anchor.href=url;anchor.download='actor-portfolio-'+active.id+'.md';
  document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 function selectProject(project:ActorPortfolioProject){
  if(dirty){setError('Сначала сохрани правки текущей визитки.');return}
  setActive(project);setError('');
 }
 return <section className="personaIndustry" style={{'--industry-ink':identity.colors.ink,'--industry-paper':identity.colors.paper,'--industry-warm':identity.colors.warm} as React.CSSProperties}>
  <header className="personaIndustryHeader">
   <button type="button" onClick={onBack}>← Мастерская</button>
   <small>PERSONA / ACTOR PORTFOLIO</small>
   <h2>Художественная визитка</h2>
   <p>Мини-фильм на 30–60 секунд: конфликт, актёрская задача, раскадровка и схема света. Это сценарный черновик, не готовое видео.</p>
  </header>
  <div className="personaIndustryPanel">
   <h3>Создать визитку</h3>
   <p>Выбери драматургию. Система собирает новый проект из сценарных конструкций Арсенала. Это локальный шаблон, а не ответ нейросети.</p>
   <div className="personaIndustryForm">
    <label>Название <input value={title} maxLength={120} onChange={e=>setTitle(e.target.value)} /></label>
    <label>Актёрская задача / жанр
     <select value={genre} onChange={e=>setGenre(e.target.value as typeof genre)}>
      <option value="drama">Камерная драма</option>
      <option value="comedy">Ироничная комедия</option>
      <option value="musical">Музыкальная драматургия</option>
     </select>
    </label>
    <button type="button" onClick={createProject}>Собрать сценарий, раскадровку и свет</button>
   </div>
  </div>
  {error&&<p role="alert" className="personaIndustryError">{error}</p>}
  {projects.length>0&&<div className="personaIndustryPanel">
   <h3>Мои визитки ({projects.length})</h3>
   <div className="personaIndustryPills">{projects.map(p=><button key={p.id} type="button" aria-pressed={active?.id===p.id} onClick={()=>selectProject(p)}>{p.title} · {p.durationSec} с</button>)}</div>
  </div>}
  {active&&<div className="personaIndustryPanel" role="region" aria-label="Сценарий художественной визитки">
   <div className="personaIndustryToolbar">
    <div><small>ACTOR PORTFOLIO · {active.durationSec} SEC</small><h3>{active.title}</h3>
     <p><b>Конфликт:</b> {active.conflict}</p>
     <p>Шесть кадров · {active.editPlan.beats.length} монтажных решений · статус: не утверждено</p>
    </div>
    <div className="personaIndustryPills">
     <button type="button" onClick={saveEdits} disabled={!dirty}>Сохранить правки</button>
     <button type="button" onClick={downloadSheet}>Скачать съёмочный лист</button>
    </div>
   </div>
   <div className="personaIndustryShots">
    {active.storyboard.map((shot,i)=><article key={shot.id}>
     <div className="personaIndustryShotTop"><span>{shot.id} / {duration(shot.startSec)}–{duration(shot.startSec+shot.durationSec)}</span><b>{shot.framing}</b></div>
     <label>Реплика <textarea aria-label={'Реплика '+shot.id} rows={2} maxLength={260} value={shot.line} onChange={e=>editShot(shot.id,'line',e.target.value)}/></label>
     <label>Действие <textarea aria-label={'Действие '+shot.id} rows={2} maxLength={600} value={shot.action} onChange={e=>editShot(shot.id,'action',e.target.value)}/></label>
     <p><b>Камера:</b> {shot.camera}</p>
     <p><b>Актёр:</b> {shot.performance}</p>
     <details><summary>Схема света</summary>
      <p><b>Key:</b> {shot.lighting.key}</p><p><b>Fill:</b> {shot.lighting.fill}</p><p><b>Back:</b> {shot.lighting.back}</p>
     </details>
     <p className="personaIndustryEditHint"><b>Монтаж:</b> {active.editPlan.beats[i].editIntent}</p>
    </article>)}
   </div>
   <p className="personaIndustryNotice">Отснятого материала нет. Match Cut требует совпадающей позы, кадрирования и новой актёрской пластики. Ассоциативные склейки — только после авторского просмотра и проверки прав.</p>
  </div>}
 </section>;
}
