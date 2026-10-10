import {useCallback,useEffect,useState} from 'react';
import {readCapturedAsset,type CreativeMediaMetadata} from './personaMediaIntake';
import {desktopRequest,getWorkerSettings,jobIdForAsset,processingRequest,safeOutputLink,
 saveWorkerSettings,type ProcessingJob,type WorkerSettings} from './personaProcessingClient';

type Scope={projectId:string;contentItemId:string;ideaId:string;ideaVersion:number;sessionId:string};
const words:Record<string,string>={queued:'В очереди',processing:'Обрабатывается',
 review:'Готово к просмотру',ready:'Видео готово',failed:'Ошибка обработки'};
const message=(e:unknown)=> {
 const s=e instanceof Error?e.message:String(e);
 if(/v11_|adapter|commit_mismatch/.test(s))return 'Движок V1.1 ещё не подключён на компьютере. Сохранённый файл можно обработать после подключения.';
 if(/fetch|network|load failed|timeout|abort/i.test(s))return 'Нет связи с компьютером. Когда он будет доступен, состояние восстановится.';
 return s.slice(0,240);
};
export default function PersonaProcessingPanel({assets,scope}:{assets:CreativeMediaMetadata[];scope:Scope}){
 const videos=assets.filter(x=>x.mime.startsWith('video/')&&
  x.projectId===scope.projectId&&x.contentItemId===scope.contentItemId&&
  x.ideaId===scope.ideaId&&x.ideaVersion===scope.ideaVersion&&x.sessionId===scope.sessionId);
 const [selected,setSelected]=useState('');
 const current=videos.find(x=>x.id===selected)||videos[0];
 const [settings,setSettings]=useState<WorkerSettings>(getWorkerSettings);
 const [draft,setDraft]=useState<WorkerSettings>(getWorkerSettings);
 const [job,setJob]=useState<ProcessingJob|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [configOpen,setConfigOpen]=useState(false);
 const enabled=!!settings.token&&!!settings.url;
 const jobId=current?jobIdForAsset(current.id):'';
 const sync=useCallback(async()=>{
  if(!current||!enabled)return;
  try{
   const updated=await desktopRequest(settings,'/v1/jobs/'+jobId,'GET');
   if(updated.request.assetId!==current.id||updated.request.sessionId!==scope.sessionId||
      updated.request.ideaVersion!==scope.ideaVersion)throw Error('Неверная версия материалов.');
   setJob(updated);setError('');
  }catch(e){
   if(e instanceof Error&&e.message==='job_not_found'){setJob(null);setError('');}
   else setError(message(e));
  }
 },[current?.id,jobId,enabled,settings.url,settings.token,scope.sessionId,scope.ideaVersion]);
 useEffect(()=>{setJob(null);setError('');if(enabled)void sync();},[sync,enabled]);
 useEffect(()=>{
  if(!enabled||!current)return;
  const interval=window.setInterval(()=>{if(document.visibilityState==='visible')void sync();},5000);
  const onVisible=()=>{if(document.visibilityState==='visible')void sync();};
  document.addEventListener('visibilitychange',onVisible);
  return ()=>{clearInterval(interval);document.removeEventListener('visibilitychange',onVisible);};
 },[enabled,current?.id,sync]);
 const configure=()=>{
  try{
   saveWorkerSettings(draft);
   setSettings({url:draft.url.trim().replace(/\/$/,''),token:draft.token});
   setConfigOpen(false);setError('');
  }catch(e){setError(message(e));}
 };
 async function submit(){
  if(!current||busy||!enabled)return;
  setBusy(true);setError('');
  try{
   // Registration is idempotent; no media bytes are sent until locally committed.
   let updated=await desktopRequest(settings,'/v1/jobs','POST',processingRequest(current));
   setJob(updated);
   if(updated.status==='failed')throw Error('Предыдущая обработка не завершилась. Используй «Повторить».');
   if(!updated.inputReady&&updated.status==='queued'){
    // IndexedDB holds source media on the iPhone. Safari does no codec work.
    const blob=await readCapturedAsset(current.id);
    if(!blob||blob.size!==current.bytes)throw Error('Файл на iPhone повреждён или отсутствует.');
    updated=await desktopRequest(settings,'/v1/jobs/'+updated.id+'/input','PUT',blob);
    setJob(updated);
   }
   await sync();
  }catch(e){setError(message(e));}
  finally{setBusy(false);}
 }
 async function action(type:'retry'|'approve'){
  if(!job||busy)return;setBusy(true);setError('');
  try{const result=await desktopRequest(settings,'/v1/jobs/'+job.id+'/'+type,'POST');setJob(result);}
  catch(e){setError(message(e));}finally{setBusy(false);}
 }
 const output=job?safeOutputLink(settings.url,job):null;
 return <section className="personaProcessor" aria-label="Обработка видео на компьютере">
  <h3>Обработка на компьютере</h3>
  {videos.length===0?<p>Сначала добавь видео на шаге «Материалы».</p>:<>
   {videos.length>1&&<label>Видео для обработки
    <select value={current?.id||''} onChange={e=>setSelected(e.target.value)}>
     {videos.map(x=><option key={x.id} value={x.id}>{x.filename}</option>)}
    </select></label>}
   <p className="personaProcessorFile">{current?.filename} · исходник на iPhone</p>
   <details open={configOpen||!enabled} onToggle={e=>setConfigOpen(e.currentTarget.open)}>
    <summary>Подключение компьютера</summary>
    <label>Защищённый адрес компьютера
     <input inputMode="url" autoCapitalize="off" value={draft.url}
      placeholder="https://desktop.example:8787" onChange={e=>setDraft({...draft,url:e.target.value})}/>
    </label>
    <label>Ключ доступа
     <input type="password" autoComplete="off" value={draft.token}
      onChange={e=>setDraft({...draft,token:e.target.value})}/>
    </label>
    <button type="button" className="creativeSecondary" onClick={configure}>Сохранить подключение</button>
   </details>
   {!job?<button type="button" className="primary" disabled={!enabled||busy} onClick={()=>void submit()}>
    {busy?'Передаю видео…':'Отправить на обработку'}
   </button>:<>
    <p role="status" className="personaProcessorState">Статус: {words[job.status]||job.status}</p>
    {job.status==='queued'&&!job.inputReady&&<button className="primary" disabled={busy} onClick={()=>void submit()}>
     {busy?'Передаю видео…':'Продолжить передачу видео'}</button>}
    {job.status==='failed'&&<button className="primary" disabled={busy} onClick={()=>void action('retry')}>
      Повторить обработку</button>}
    {output&&<a className="personaProcessorOutput" href={output} target="_blank" rel="noopener noreferrer">
      Открыть видео для Instagram ↗</a>}
    {job.status==='review'&&<button className="primary" disabled={busy} onClick={()=>void action('approve')}>
      Видео подходит — готово</button>}
   </>}
  </>}
  {error&&<p role="alert" className="creativeError">{error}</p>}
  <p className="personaProcessorNote">Обработка происходит на домашнем компьютере. Пока компьютер недоступен, файлы остаются на iPhone.</p>
 </section>;
}
