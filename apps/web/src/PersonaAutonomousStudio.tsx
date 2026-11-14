import React,{useEffect,useState} from 'react';

type StudioStatus = {
 state:'idle'|'running'|'completed'|'failed';
 error:string|null;
 report?:{status:'APPROVED'|'REJECTED';attempts:number;missingReferences?:string[];soundSelectionBlocked?:string;critique?:{
  audioReview?:{score?:number;observation:string};provider:string;model:string;observations:string;checklist:string[];scores:{color:number;titles:number;composition:number;editing?:number};
 }};
};

export function PersonaAutonomousStudio({url,token,ready,configured}:{
 url:string;token:string;ready:boolean;configured:boolean;
}) {
 const [consent,setConsent]=useState(false);
 const [status,setStatus]=useState<StudioStatus|null>(null);
 const [starting,setStarting]=useState(false);
 const [error,setError]=useState('');
 const active=status?.state==='running';

 useEffect(()=>{
  if(!ready)return;
  const controller=new AbortController();
  let timer:number|undefined;
  const poll=async()=>{
   try {
    const response=await fetch(url,{headers:{'X-Persona-Worker-Token':token},signal:controller.signal});
    if(!response.ok)throw Error('Не удалось прочитать состояние автономной студии');
    const next:StudioStatus=await response.json();
    if(controller.signal.aborted)return;
    setStatus(next);
    setError("");
    if(next.state==='running')timer=window.setTimeout(()=>void poll(),1200);
   } catch(e) {
    if(controller.signal.aborted)return;
    setError((e as Error).message);
    if(active)timer=window.setTimeout(()=>void poll(),1200);
   }
  };
  void poll();
  return()=>{controller.abort();window.clearTimeout(timer);};
 },[url,token,ready,active]);

 async function start(){
  if(!consent||!ready||!configured||starting||active)return;
  setStarting(true);
  setError('');
  try {
   const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Persona-Worker-Token':token},
    body:JSON.stringify({consent:true})});
   const next=await response.json();
   if(!response.ok)throw Error(next.error||'Автономная студия не запущена');
   setStatus(next);
  } catch(e){setError((e as Error).message);}
  finally{setStarting(false);}
 }

 const review=status?.report?.critique;
 return <div aria-label="Автономная студия">
  <p>{ready?'Resolve применит оформление к проверенному таймлайну. До трёх попыток.':
   'Сначала соберите локальный черновик с проверенными дублями.'}</p>
  {ready&&!configured&&<p>Настройте ключ OpenRouter и локальный мост Resolve.</p>}
  {ready&&configured&&<label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} disabled={active||starting}/>
   {' '}Разрешаю отправить в OpenRouter сценарий и отобранные кадры и аудиофрагменты монтажа, эталонов и выбранных для подбора звуковых файлов. Бесплатные модели NVIDIA предназначены только для материалов без узнаваемых лиц, голосов и конфиденциальной информации.</label>}
  <button type="button" className="ghost" disabled={!ready||!configured||!consent||active||starting}
   onClick={()=>void start()}>Запустить Автономный Монтаж</button>
  {active&&<p role="status">Режиссура, рендер Resolve и проверка кадров…</p>}
  {(error||status?.error)&&<p role="alert">{error||status?.error}</p>}
  {status?.state==='completed'&&status.report&&<>
   <p role="status">{status.report.status==='APPROVED'?'Порог проверки пройден':'Порог проверки не пройден'} · попыток: {status.report.attempts}. Требуется авторская приёмка.</p>
   {Boolean(status.report.missingReferences?.length)&&<p>Нет эталонов в папках {status.report.missingReferences?.join(", ")}.</p>}
   {status.report.soundSelectionBlocked&&<p>{status.report.soundSelectionBlocked}</p>}
   {review&&<><p>{review.provider} · {review.model}. Цвет {review.scores.color}/10, титры {review.scores.titles}/10, композиция {review.scores.composition}/10{review.scores.editing!==undefined&&`, монтаж по стоп-кадрам ${review.scores.editing}/10`}.</p>
    <p>{review.observations}</p>{review.audioReview&&<p>Звук {review.audioReview.score===undefined?"":review.audioReview.score+"/10. "}{review.audioReview.observation}</p>}{review.checklist.length>0&&<ul>{review.checklist.map((item,i)=><li key={i}>{item}</li>)}</ul>}</>}
   <video controls preload="metadata" src={url+'/video?token='+encodeURIComponent(token)} style={{width:'100%',maxHeight:420}}/>
  </>}
 </div>;
}
