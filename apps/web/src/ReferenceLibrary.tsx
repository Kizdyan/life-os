import {useEffect,useMemo,useRef,useState,type ChangeEvent} from 'react';
import {
  classifyReferenceFile, referenceGroups,
  type ReferenceEntry, type ReferenceGroup
} from './referenceLibraryBrowser';
import {buildReferenceManifest,suggestReferenceOrganization} from './referenceOrganization';

const HASH_LIMIT_BYTES=64*1024*1024;
const MAX_FILES=100;
const label:Record<ReferenceEntry['kind'],string>={
  video:'Видео',image:'Фото',document:'Документ',other:'Другой файл'
};
const formatSize=(bytes:number)=>bytes<1024*1024
  ?(bytes/1024).toFixed(0)+' КБ'
  :(bytes/1024/1024).toFixed(1)+' МБ';

async function sha256(file:File):Promise<string> {
  if(!globalThis.crypto?.subtle)throw Error('SHA-256 недоступен в этом браузере');
  const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function Groups({title,groups,empty}:{title:string;groups:ReferenceGroup[];empty:string}) {
  return <div className="referenceGroup">
    <h3>{title} ({groups.length})</h3>
    {!groups.length?<p className="referenceMuted">{empty}</p>:groups.map(group=>
      <div key={group.key} className="referenceGroupItem">
        {group.files.map(file=><div key={file.id}>{file.name}</div>)}
      </div>)}
  </div>;
}

export default function ReferenceLibrary() {
  const [files,setFiles]=useState<File[]>([]);
  const [entries,setEntries]=useState<ReferenceEntry[]>([]);
  const [busy,setBusy]=useState(false);
  const [progress,setProgress]=useState('');
  const [error,setError]=useState('');
  const [previewId,setPreviewId]=useState<number|null>(null);
  const [search,setSearch]=useState('');
  const [kindFilter,setKindFilter]=useState<'all'|ReferenceEntry['kind']>('all');
  const [showPlan,setShowPlan]=useState(false);
  const [previewUrl,setPreviewUrl]=useState<string|null>(null);
  const scanRef=useRef(0);
  useEffect(()=>()=>{scanRef.current+=1},[]);
  useEffect(()=>{
    if(previewId===null || !files[previewId]) {setPreviewUrl(null);return;}
    const file=files[previewId];
    if(!['image','video'].includes(classifyReferenceFile(file.name))){setPreviewUrl(null);return;}
    const url=URL.createObjectURL(file);
    setPreviewUrl(url);
    return ()=>{URL.revokeObjectURL(url);};
  },[files,previewId]);
  const groups=useMemo(()=>referenceGroups(entries),[entries]);
  const proposals=useMemo(()=>suggestReferenceOrganization(entries),[entries]);
  const shown=useMemo(()=>entries.filter(item=>(kindFilter==='all'||item.kind===kindFilter)&&item.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())),[entries,kindFilter,search]);
  const counts=useMemo(()=>({video:entries.filter(x=>x.kind==='video').length,image:entries.filter(x=>x.kind==='image').length,document:entries.filter(x=>x.kind==='document').length}),[entries]);
  const skipped=entries.filter(x=>x.hashStatus!=='verified').length;
  const preview=previewId===null?null:entries.find(x=>x.id===previewId)??null;

  async function chooseFiles(event:ChangeEvent<HTMLInputElement>) {
    const selected=Array.from(event.currentTarget.files??[]).slice(0,MAX_FILES);
    const extra=(event.currentTarget.files?.length??0)-selected.length;
    event.currentTarget.value='';
    const scan=++scanRef.current;
    setFiles(selected);setEntries([]);setPreviewId(null);setShowPlan(false);setError('');
    if(!selected.length){setProgress('');setBusy(false);return;}
    setBusy(true);
    const scanned:ReferenceEntry[]=[];
    for(let i=0;i<selected.length;i++){
      const file=selected[i];
      setProgress('Проверено '+i+' из '+selected.length);
      let hash:string|null=null;
      let hashStatus:ReferenceEntry['hashStatus']='unavailable';
      if(file.size<=HASH_LIMIT_BYTES) {
        try {hash=await sha256(file);hashStatus='verified';}
        catch {hashStatus='unavailable';}
      } else hashStatus='too_large';
      if(scan!==scanRef.current)return;
      scanned.push({id:i,name:file.name,kind:classifyReferenceFile(file.name),sizeBytes:file.size,sha256:hash,hashStatus});
    }
    if(scan!==scanRef.current)return;
    setEntries(scanned);
    setProgress('');
    setBusy(false);
    if(extra>0)setError('Показаны первые '+MAX_FILES+' файлов. Остальные '+extra+' нужно выбрать отдельно.');
  }
  function exportPlan(){
    if(busy||!entries.length)return;
    const manifest=buildReferenceManifest(entries,new Date().toISOString());
    const blob=new Blob([JSON.stringify(manifest,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;link.download='persona-reference-plan.json';
    document.body.appendChild(link);link.click();link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  return <section className="referenceLibrary" aria-label="Библиотека референсов">
    <div className="referenceIntro">
      <p>Выбери фото, видео или документы для просмотра. Файлы остаются на устройстве: приложение их не загружает, не перемещает и не удаляет.</p>
      <label className="referenceChoose">
        Выбрать файлы
        <input type="file" multiple disabled={busy} onChange={e=>void chooseFiles(e)} aria-label="Выбрать файлы для локального анализа"/>
      </label>
      <p className="referenceMuted">Браузер видит только выбранные файлы, а не всю папку Downloads. Список исчезнет после перезагрузки.</p>
    </div>
    {busy&&<p role="status">{progress||'Анализ файлов…'}</p>}
    {error&&<p role="alert" className="referenceError">{error}</p>}
    {!busy&&entries.length>0&&<>
      <div className="referenceStats" aria-label="Сводка файлов">
        <div><b>{entries.length}</b><span>Всего</span></div>
        <div><b>{counts.video}</b><span>Видео</span></div>
        <div><b>{counts.image}</b><span>Фото</span></div>
        <div><b>{counts.document}</b><span>Документы</span></div>
      </div>
      <Groups title="Точные повторы по SHA-256" groups={groups.exactDuplicates} empty="Подтверждённых одинаковых файлов нет."/>
      <Groups title="Похожие имена — проверить вручную" groups={groups.similarNames} empty="Совпадений нормализованных имён нет."/>
      {skipped>0&&<p role="status" className="referenceNotice">
        У {skipped} файлов хеш не вычислен. Для файлов больше 64 МБ это ограничение защищает память iPhone.
        Такие файлы не считаются точными дублями, даже если имена совпадают.
      </p>}
      <div className="referenceSearch"><label>Поиск по названию
        <input type="search" placeholder="Например, кадр или репетиция" value={search} onChange={e=>setSearch(e.target.value)} />
      </label><label>Тип
        <select value={kindFilter} onChange={e=>setKindFilter(e.target.value as typeof kindFilter)}>
          <option value="all">Все файлы</option><option value="video">Видео</option>
          <option value="image">Фото</option><option value="document">Документы</option><option value="other">Другие</option>
        </select>
      </label></div>
      <h3>Выбранные файлы ({shown.length} из {entries.length})</h3>
      {!shown.length&&<p className="referenceMuted">По запросу ничего не найдено.</p>}
      <div className="referenceFiles">{shown.map(file=><div key={file.id} className="referenceFile">
        <div><b>{file.name}</b><span>{label[file.kind]} · {formatSize(file.sizeBytes)} · {file.hashStatus==='verified'?'SHA-256 проверен':'Без проверки SHA-256'}</span></div>
        {['image','video'].includes(file.kind)&&<button type="button" onClick={()=>setPreviewId(file.id)}>Просмотр</button>}
      </div>)}</div>
      <div className="referencePlan">
        <div><h3>Предварительный план организации</h3>
          <p>План предлагает папки и уникальные имена, но ничего не переносит и не переименовывает. Точные копии помечены для ручной проверки.</p>
        </div>
        <button type="button" onClick={()=>setShowPlan(v=>!v)}>{showPlan?'Скрыть предложения':'Посмотреть предложения'}</button>
        {showPlan&&<>
          <div className="referencePlanItems">{proposals.map(proposal=><div key={proposal.id}>
            <span>{proposal.originalName}</span>
            <b>{proposal.proposedRelativePath}</b>
            {proposal.duplicateReviewRequired&&<em>Содержимое совпадает — проверить вручную</em>}
          </div>)}</div>
          <button type="button" onClick={exportPlan}>Скачать план JSON</button>
          <p className="referenceMuted">JSON сохраняется только по твоему действию. Это список предложений, не команда на изменение файлов.</p>
        </>}
      </div>
    </>}
    {previewUrl&&preview&&<div className="referencePreview" aria-label="Предпросмотр файла">
      <div className="referencePreviewHead"><b>{preview.name}</b><button type="button" onClick={()=>setPreviewId(null)}>Закрыть</button></div>
      {preview.kind==='image'?<img src={previewUrl} alt={preview.name}/>:<video src={previewUrl} controls playsInline preload="metadata"/>}
    </div>}
  </section>;
}
