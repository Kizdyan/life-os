import React,{useEffect,useState} from 'react';
import {
 REFERENCE_LAB_KEY,REFERENCE_INSIGHTS,emptyReferenceLab,loadReferenceLab,
 saveReferenceLab,reviseReferenceLab,researchPrompt,scenarioPrompt,makeFactoryBatch,
 makeTrialCampaign,trialObservations,captureChecklist,editsSupport,
 type ReferenceLabState,type CapturePreset,type Audience,type FactoryItem,type TrialCampaign
} from './personaReferenceWorkflows';
import {generatePersonaDraftWithRealAi,type GeneratedDraft} from './personaScriptGeneration';
import './persona-reference-workflows.css';

type VideoProject={id:string;title:string};
type Props={videos:VideoProject[];
 onCreateCarouselDraft:(title:string,angle:string,draft?:GeneratedDraft)=>void;
 onCreateReelDraft:(title:string,angle:string)=>void};
const uuid=(prefix:string)=>prefix+'-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);
const copy=async(text:string)=>{if(!navigator.clipboard)throw Error('Буфер обмена недоступен. Выдели текст вручную.');await navigator.clipboard.writeText(text)};
export default function PersonaReferenceWorkflows({videos,onCreateCarouselDraft,onCreateReelDraft}:Props){
 const [data,setData]=useState<ReferenceLabState>(()=>{
  try{return loadReferenceLab(localStorage)}catch{return emptyReferenceLab()}
 });
 const [problem,setProblem]=useState('');
 const [notice,setNotice]=useState('');
 const [sourceUrl,setSourceUrl]=useState('');
 const [sourceFinding,setSourceFinding]=useState('');
 const [batchText,setBatchText]=useState('');
 const [batchFormat,setBatchFormat]=useState<'reel'|'carousel'>('carousel');
 const [trialName,setTrialName]=useState('');
 const [trialProject,setTrialProject]=useState('');
 const [os,setOs]=useState<'windows'|'mac'|'unknown'>('windows');
 const [busy,setBusy]=useState(false);
 useEffect(()=>{
  try{setData(loadReferenceLab(localStorage))}catch(e){setProblem((e as Error).message)}
  const sync=(e:StorageEvent)=>{
   if(e.key===REFERENCE_LAB_KEY)try{setData(loadReferenceLab(localStorage))}
   catch(err){setProblem((err as Error).message)}
  };
  window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);
 },[]);
 function write(changes:Partial<Omit<ReferenceLabState,'version'|'revision'>>){
  try{const next=reviseReferenceLab(data,changes);saveReferenceLab(localStorage,next);
   setData(next);setProblem('');setNotice('Сохранено в браузере. Полный ZIP включает эту мастерскую.')}
  catch(e){setProblem((e as Error).message)}
 }
 async function copied(text:string){
  try{await copy(text);setNotice('Текст скопирован. Проверь факты и источники до утверждения.')}
  catch(e){setProblem((e as Error).message)}
 }
 function addSource(){
  const url=sourceUrl.trim(),finding=sourceFinding.trim();
  if(!/^https:\/\/\S+$/u.test(url)||!finding){setProblem('Для источника нужны HTTPS-ссылка и конкретный вывод.');return}
  write({sources:[...data.sources,{id:uuid('source'),url,finding,status:'unverified'}]});
  setSourceUrl('');setSourceFinding('');
 }
 function buildBatch(){
  try{
   const newItems=makeFactoryBatch(batchText,batchFormat);
   const combined=[...data.batch,...newItems];
   if(combined.length>30)throw Error('Максимум 30 запланированных идей; сначала выбери или очисти старые.');
   write({batch:combined});setBatchText('');
  }catch(e){setProblem((e as Error).message)}
 }
 function startBatch(item:FactoryItem){
  try{
   if(item.format==='carousel')onCreateCarouselDraft(item.title,data.researchNotes.trim()||'Уточнить конфликт, зрителя и источники');
   else onCreateReelDraft(item.title,data.researchNotes.trim()||'Уточнить конфликт и съёмочный план');
   write({batch:data.batch.map(x=>x.id===item.id?{...x,state:'selected'}:x)});
  }catch(e){setProblem((e as Error).message)}
 }
 async function createWithAi(){
  if(!data.topic.trim()||busy){setProblem('Сначала сформулируй конкретную тему.');return}
  setBusy(true);setNotice('Проверяю локальный Ollama или явно настроенный OpenRouter. Текст не утверждается автоматически.');
  try{
   const result=await generatePersonaDraftWithRealAi({
    idea:{id:uuid('carousel-research'),title:data.topic,angle:data.researchNotes||'Идея требует авторского уточнения',format:'carousel'},
    history:[]
   });
   if(!result){setProblem('ИИ недоступен. Ничего не подменено шаблоном — создай ручной черновик.');return}
   onCreateCarouselDraft(data.topic,data.researchNotes.trim()||'Автор должен проверить тезисы',result.draft);
   setNotice('Получен черновик '+result.provider+' ('+result.model+'). Авторские факты, тексты и стиль не утверждены.');
  }catch(e){setProblem((e as Error).message)}
  finally{setBusy(false)}
 }
 function createTrial(){
  try{
   const chosen=videos.find(v=>v.id===trialProject);
   const campaign=makeTrialCampaign(trialName.trim()||chosen?.title||'');
   if(chosen)campaign.sourceProjectId=chosen.id;
   if(data.trials.length>=30)throw Error('Достигнут предел экспериментальных планов');
   write({trials:[...data.trials,campaign]});setTrialName('');
  }catch(e){setProblem((e as Error).message)}
 }
 function changeTrial(id:string,patch:(t:TrialCampaign)=>TrialCampaign){
  write({trials:data.trials.map(t=>t.id===id?patch(t):t)});
 }
 function updateCapture<K extends keyof CapturePreset>(key:K,value:CapturePreset[K]){
  write({capture:{...data.capture,[key]:value}});
 }
 const checklist=captureChecklist(data.capture),support=editsSupport(os);
 return <section className="personaReferenceLab" aria-label="Лаборатория контента по пяти видео" data-testid="persona-reference-lab">
  <header className="personaReferenceHeader">
   <small>PERSONA / REFERENCE → WORKFLOW</small>
   <h2>Контент-завод: идеи, эксперименты и съёмка</h2>
   <p>Практические инструменты из пяти референсов. Исследовательские гипотезы, план производства и пробные публикации не считаются готовыми MP4 или подтверждённой аналитикой.</p>
  </header>
  <details className="personaReferenceSources">
   <summary>Что перенесено из 5 видео <span>· исходные идеи и ограничения</span></summary>
   <div>{REFERENCE_INSIGHTS.map((item,i)=><article key={item.id}>
    <strong>Видео {i+1}: {item.observed}</strong>
    <p>В Persona: {item.adaptation}</p><small>Ограничение: {item.limit}</small>
   </article>)}</div>
  </details>
  <div className="personaReferenceSections">
   <details open>
    <summary><strong>01 · Исследование аудитории</strong><span>GPT / Perplexity → сценарий</span></summary>
    <div className="personaReferenceBody">
     <p>Не просим «сделай вирусный ролик». Сначала выясняем реальные вопросы аудитории, проверяем ссылки и только затем формируем драматургию. Автоматическое подключение Perplexity здесь не заявляется.</p>
     <div className="personaReferenceForm">
      <label>Тема<input value={data.topic} maxLength={170} placeholder="Например: почему молчание меняет сцену"
       onChange={e=>write({topic:e.target.value})}/></label>
      <label>Для кого
       <select value={data.audience} onChange={e=>write({audience:e.target.value as Audience})}>
        <option value="industry">Режиссёры / кастинг / продюсеры</option>
        <option value="viewers">Зрители и творческое сообщество</option>
        <option value="clients">Заказчики музыки и съёмок</option>
       </select>
      </label>
     </div>
     <div className="personaReferenceActions">
      <button type="button" onClick={()=>void copied(researchPrompt(data.topic,data.audience))}>Копировать запрос исследования</button>
      <button type="button" onClick={()=>void copied(scenarioPrompt(data.topic,data.researchNotes))}>Копировать сценарный запрос</button>
     </div>
     <label>Проверенные находки, наблюдения и ограничения автора
      <textarea rows={3} maxLength={4000} value={data.researchNotes} placeholder="Вставь сюда подтверждённые тезисы после исследования. Неподтверждённое помечай отдельно."
       onChange={e=>write({researchNotes:e.target.value})}/>
     </label>
     <div className="personaReferenceForm">
      <label>Ссылка на источник<input type="url" value={sourceUrl} placeholder="https://…" onChange={e=>setSourceUrl(e.target.value)}/></label>
      <label>Что подтверждает<input value={sourceFinding} maxLength={1200} placeholder="Факт или конкретное наблюдение" onChange={e=>setSourceFinding(e.target.value)}/></label>
      <button type="button" onClick={addSource}>Добавить источник</button>
     </div>
     {data.sources.length>0&&<ul className="personaReferenceLinks">
      {data.sources.map(s=><li key={s.id}>
       <a href={s.url} target="_blank" rel="noopener noreferrer">{s.url.slice(0,90)}</a>
       <span>{s.finding}</span>
       <button type="button" onClick={()=>write({sources:data.sources.map(x=>x.id===s.id?{...x,status:x.status==='unverified'?'reviewed':'unverified'}:x)})}>
        {s.status==='reviewed'?'Отмечено как проверенное автором':'Не проверено'}
       </button>
      </li>)}
     </ul>}
     <div className="personaReferenceActions">
      <button type="button" disabled={!data.topic.trim()} onClick={()=>
       onCreateCarouselDraft(data.topic,data.researchNotes.trim()||'Тема требует проверки')}>Создать карусель-черновик</button>
      <button type="button" disabled={busy||!data.topic.trim()} onClick={()=>void createWithAi()}>
       {busy?'Запрос к реальной модели…':'Создать черновик с реальным ИИ'}</button>
     </div>
     <small>Оба варианта открывают действующий Editorial Desk: сначала тема, затем текст, затем оформление и отдельные утверждения. Ничего не публикуется автоматически.</small>
    </div>
   </details>
   <details>
    <summary><strong>02 · Пакетное производство</strong><span>Без фальшивых «99 готовых видео»</span></summary>
    <div className="personaReferenceBody">
     <p>Идея из второго ролика — находить подходящие фрагменты и готовить серии быстрее. План очереди не означает, что медиа уже найдены, смонтированы или проверены.</p>
     <label>Темы, по одной на строку (1–20)
      <textarea rows={4} value={batchText} onChange={e=>setBatchText(e.target.value)} placeholder={'Один предмет — разные персонажи\nГде музыка спорит со словами\nПауза, в которой герой выбирает'}/></label>
     <div className="personaReferenceActions">
      <select aria-label="Формат пакетных идей" value={batchFormat} onChange={e=>setBatchFormat(e.target.value as 'reel'|'carousel')}>
       <option value="carousel">Карусели</option><option value="reel">Reels</option>
      </select>
      <button type="button" onClick={buildBatch}>Сформировать очередь идей</button>
     </div>
     {data.batch.length>0&&<div className="personaReferenceQueue">
      {data.batch.map(item=><div key={item.id}>
       <strong>{item.title}</strong><small>{item.format==='reel'?'Reel':'Карусель'} · {item.state==='selected'?'Выбрано в проект':'Только идея'}</small>
       <button type="button" onClick={()=>startBatch(item)}>Открыть в производстве</button>
      </div>)}
     </div>}
     <small>Видео из архива подбираются только при доступе к реальным файлам. Далее используются существующие сценарий → съёмка → монтаж → QA, не отдельный «параллельный» монтажёр.</small>
    </div>
   </details>
   <details>
    <summary><strong>03 · Trial Reels</strong><span>5 вариантов · ручные метрики</span></summary>
    <div className="personaReferenceBody">
     <p>Пробные Reels показывают материал прежде всего новой аудитории. Это не гарантированный A/B-тест: версиям могут достаться разные показы и условия.</p>
     <div className="personaReferenceForm">
      <label>Название экспериментального ролика<input maxLength={160} value={trialName} onChange={e=>setTrialName(e.target.value)} placeholder="Какая сцена удержит внимание?"/></label>
      <label>Связать с существующим Reels-проектом
       <select value={trialProject} onChange={e=>setTrialProject(e.target.value)}>
        <option value="">Без проекта</option>{videos.map(v=><option key={v.id} value={v.id}>{v.title}</option>)}
       </select>
      </label>
     </div>
     <button type="button" onClick={createTrial}>Создать 5 гипотез первых секунд</button>
     {data.trials.slice().reverse().map(t=><article className="personaReferenceTrial" key={t.id}>
      <h4>{t.title}</h4>
      <small>Эксперимент: только план. Первые метрики вводятся после реального Trial Reel, не из шаблона.</small>
      {t.variants.map((v,i)=><div className="personaReferenceVariant" key={v.id}>
       <strong>V{i+1}</strong>
       <input aria-label={'Хук V'+(i+1)} value={v.hook} maxLength={180} onChange={e=>changeTrial(t.id,old=>({...old,
        variants:old.variants.map(x=>x.id===v.id?{...x,hook:e.target.value}:x)}))}/>
       <select aria-label={'Статус V'+(i+1)} value={v.state} onChange={e=>changeTrial(t.id,old=>({...old,variants:old.variants.map(x=>
        x.id===v.id?{...x,state:e.target.value as typeof v.state}:x)}))}>
        <option value="draft">Черновик</option>
        <option value="shared_manually">Опубликовано как Trial вручную</option>
        <option value="metrics_entered">Метрики записаны вручную</option>
        <option value="released_manually">Выпущено для всех вручную</option>
       </select>
       <div className="personaReferenceVariantExtra">
        <label>Плановая дата Trial (не публикация)<input type="date" aria-label={'Дата V'+(i+1)}
         value={v.plannedDate??''} onChange={e=>changeTrial(t.id,old=>({...old,
          variants:old.variants.map(x=>x.id===v.id?{...x,plannedDate:e.target.value||undefined}:x)}))}/></label>
        <label>Отличие музыки/звука<input aria-label={'Звук V'+(i+1)} maxLength={180} value={v.audioNote??''}
         placeholder="Безопасный оригинальный звук или библиотека" onChange={e=>changeTrial(t.id,old=>({...old,
          variants:old.variants.map(x=>x.id===v.id?{...x,audioNote:e.target.value}:x)}))}/></label>
        <label>Отличие монтажа/обложки<input aria-label={'Визуал V'+(i+1)} maxLength={180} value={v.visualNote??''}
         placeholder="Первый кадр, надпись, монтаж" onChange={e=>changeTrial(t.id,old=>({...old,
          variants:old.variants.map(x=>x.id===v.id?{...x,visualNote:e.target.value}:x)}))}/></label>
       </div>
       {(['views','shares','likes','comments'] as const).map(key=>
        <label key={key}>{({views:'Просмотры',shares:'Пересылки',likes:'Лайки',comments:'Комментарии'} as const)[key]}
         <input type="number" min={0} max={1000000000} value={v[key]??''} aria-label={key+' V'+(i+1)} onChange={e=>{
          const value=e.target.value;
          changeTrial(t.id,old=>({...old,variants:old.variants.map(x=>
           x.id===v.id?{...x,[key]:value===''?undefined:Number(value)}:x)}));
         }}/></label>
       )}
      </div>)}
      {trialObservations(t).length>=2&&<p className="personaReferenceTrialNote">
       Сравнение пересылок на 100 просмотров (ориентир, не доказательство причинности):
       {' '+trialObservations(t).map(x=>x.id.split('-').slice(-1)[0].toUpperCase()+': '+x.shareRate+'%').join(' · ')}
      </p>}
     </article>)}
     <small>Meta сообщает о первых Trial-метриках примерно через 24 часа. Варианты пользователь публикует сам. Автоматическая публикация и выбор «победителя» отключены.</small>
    </div>
   </details>
   <details>
    <summary><strong>04 · Съёмка в Blackmagic Camera</strong><span>Профиль и контроль качества</span></summary>
    <div className="personaReferenceBody">
     <div className="personaReferenceForm">
      <label>Устройство
       <select value={data.capture.device} onChange={e=>updateCapture('device',e.target.value as CapturePreset['device'])}>
        <option value="iphone">iPhone</option><option value="android">Android</option><option value="camera">Другая камера</option>
       </select>
      </label>
      <label>Разрешение
       <select value={data.capture.resolution} onChange={e=>updateCapture('resolution',e.target.value as CapturePreset['resolution'])}>
        <option value="4k">4K</option><option value="1080p">1080p</option>
       </select>
      </label>
      <label>Кодек
       <select value={data.capture.codec} onChange={e=>updateCapture('codec',e.target.value as CapturePreset['codec'])}>
        <option value="hevc">HEVC / H.265</option><option value="h264">H.264</option><option value="prores">ProRes (если поддерживается)</option>
       </select>
      </label>
      <label>FPS
       <select value={data.capture.fps} onChange={e=>updateCapture('fps',Number(e.target.value) as CapturePreset['fps'])}>
        {[24,25,30,60].map(n=><option key={n} value={n}>{n}</option>)}
       </select>
      </label>
     </div>
     <div className="personaReferenceActions personaReferenceChecks">
      {(['vertical','whiteBalanceLocked','exposureLocked'] as const).map((k,i)=>
       <label key={k}><input type="checkbox" checked={data.capture[k]} onChange={e=>updateCapture(k,e.target.checked)}/>
        {['Вертикальная съёмка','Фиксировать баланс белого','Фиксировать экспозицию'][i]}</label>)}
     </div>
     <ul>{checklist.items.map((line,i)=><li key={i}>{line}</li>)}</ul>
     <div className="personaReferenceWarnings">{checklist.warnings.map((line,i)=><p key={i}>{line}</p>)}</div>
     <button type="button" onClick={()=>void copied([...checklist.items,...checklist.warnings].join('\n'))}>Копировать съёмочный чек-лист</button>
    </div>
   </details>
   <details>
    <summary><strong>05 · Claude Code + Edits</strong><span>Выбор совместимого редактора</span></summary>
    <div className="personaReferenceBody">
     <label>На каком компьютере выполняется монтаж?
      <select value={os} onChange={e=>setOs(e.target.value as typeof os)}>
       <option value="windows">Windows</option><option value="mac">Mac</option><option value="unknown">Не определено</option>
      </select>
     </label>
     <p className={support.supported?'personaReferenceNote':'personaReferenceWarnings'}>{support.label}</p>
     <p>{support.warning}</p>
     {os==='mac'&&<p>Если Mac действительно доступен: установи официальный Edits, включи Automation Server, сам скопируй команду подключения агента и проверь реальные MCP-инструменты. Не переноси токен в Persona или чат.</p>}
     <p>Основная Windows-ветка Persona продолжает использовать FFmpeg и существующий QA. Новый Edits-адаптер на Windows не симулируется.</p>
    </div>
   </details>
  </div>
  {problem&&<p className="personaReferenceError" role="alert">{problem}</p>}
  {notice&&<p className="personaReferenceNotice" role="status">{notice}</p>}
 </section>;
}
