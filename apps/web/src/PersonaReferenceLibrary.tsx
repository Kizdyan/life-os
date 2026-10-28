import React, {useMemo,useState} from 'react';
import {
  REFERENCE_LIBRARY_KEY,REFERENCE_CATEGORIES,analyzeReferenceDuplicates,
  kindForReferenceName,makeReferenceItem,mergeReferenceItems,parseInventoryReport,
  readReferenceCatalog,type ReferenceCatalog,type ReferenceCategory,type ReferenceItem,
  type ReferenceKind,
} from './personaReferenceCatalog';
import './persona-reference-library.css';

function initialCatalog():ReferenceCatalog {
  try{return readReferenceCatalog(localStorage.getItem(REFERENCE_LIBRARY_KEY));}
  catch{return {schemaVersion:1,items:[]};}
}
function fileSize(n:number):string {
  return n<1024 ? n+' Б' : n<1048576 ? (n/1024).toFixed(1)+' КБ' : (n/1048576).toFixed(1)+' МБ';
}
const MAX_BROWSER_SHA_BYTES=16*1024*1024;
const MAX_PICKED_FILES=250;
export default function PersonaReferenceLibrary({onBack}:{onBack:()=>void}) {
  const [catalog,setCatalog]=useState<ReferenceCatalog>(initialCatalog);
  const [pendingImport,setPendingImport]=useState<ReferenceItem[]|null>(null);
  const [pendingCategories,setPendingCategories]=useState<Record<string,ReferenceCategory>>({});
  const [query,setQuery]=useState('');
  const [kind,setKind]=useState<ReferenceKind|'all'>('all');
  const [category,setCategory]=useState<ReferenceCategory|'all'>('all');
  const [sort,setSort]=useState<'name'|'size'|'kind'>('name');
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState('');
  const {exact,candidates}=useMemo(()=>analyzeReferenceDuplicates(catalog.items),[catalog.items]);
  const filtered=useMemo(()=>{
    const term=query.trim().toLowerCase();
    return catalog.items.filter(item=>
      (kind==='all'||item.type===kind) &&
      (category==='all'||(pendingCategories[item.id]??item.category)===category) &&
      (!term||item.name.toLowerCase().includes(term)||item.category.includes(term))
    ).sort((a,b)=>sort==='size'?b.sizeBytes-a.sizeBytes:sort==='kind'?
      a.type.localeCompare(b.type)||a.name.localeCompare(b.name,'ru'):
      a.name.localeCompare(b.name,'ru'));
  },[catalog.items,kind,category,query,sort,pendingCategories]);
  function persist(items:ReferenceItem[],success:string) {
    const next:ReferenceCatalog={schemaVersion:1,items};
    try{
      localStorage.setItem(REFERENCE_LIBRARY_KEY,JSON.stringify(next));
      setCatalog(next);
      setStatus(success);
      return true;
    }catch{
      setStatus('Не удалось сохранить каталог. Хранилище браузера может быть заполнено. Изменения не применены.');
      return false;
    }
  }
  async function pickFiles(e:React.ChangeEvent<HTMLInputElement>) {
    const selected=Array.from(e.target.files??[]);
    e.target.value='';
    if(!selected.length)return;
    if(selected.length>MAX_PICKED_FILES){
      setStatus('За один раз можно выбрать не более 250 файлов. Ничего не добавлено.');
      return;
    }
    setBusy(true);
    setStatus('Читаю только свойства выбранных файлов. Файлы никуда не отправляются.');
    try {
      const added:ReferenceItem[]=[];
      let skipped=0;
      for(const file of selected) {
        const type=kindForReferenceName(file.name);
        if(!type){skipped++;continue;}
        let sha256:string|null=null;
        if(file.size<=MAX_BROWSER_SHA_BYTES && globalThis.crypto?.subtle) {
          try{
            const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
            sha256=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');
          }catch{/* Do not pretend an unavailable hash was computed. */}
        }
        added.push(makeReferenceItem({
          name:file.name,type,sizeBytes:file.size,sha256,
          lastModified:file.lastModified,source:'files',
        }));
      }
      setPendingImport(added);
      setStatus('Предпросмотр: '+added.length+' файлов; пропущено '+skipped+
        '. Для больших видео SHA-256 в браузере не вычисляется. Подтверди добавление.');
    }catch(error){setPendingImport(null);setStatus(String((error as Error).message||'Не удалось открыть файлы.'));}
    finally{setBusy(false);}
  }
  async function pickReport(e:React.ChangeEvent<HTMLInputElement>) {
    const file=e.target.files?.[0];
    e.target.value='';
    if(!file)return;
    setBusy(true);
    try{
      if(file.size>3_000_000)throw new Error('Отчёт слишком большой');
      const rows=parseInventoryReport(await file.text());
      setPendingImport(rows);
      setStatus('Отчёт проверен: '+rows.length+' записей. Проверь количество и подтверди импорт.');
    }catch(error){setPendingImport(null);setStatus(String((error as Error).message||'Не удалось прочитать отчёт.'));}
    finally{setBusy(false);}
  }
  function confirmImport() {
    if(pendingImport===null)return;
    try{
      const next=mergeReferenceItems(catalog.items,pendingImport);
      if(persist(next,'Каталог обновлён. Добавлено новых записей: '+(next.length-catalog.items.length)+'.'))
        setPendingImport(null);
    }catch(error){setStatus(String((error as Error).message||'Импорт не выполнен.'));}
  }
  function confirmCategories() {
    const changes=Object.entries(pendingCategories);
    if(!changes.length)return;
    const next=catalog.items.map(item=>
      pendingCategories[item.id]!==undefined?
        {...item,category:pendingCategories[item.id],reviewed:true}:item);
    if(persist(next,'Категории подтверждены: '+changes.length+'.'))setPendingCategories({});
  }
  function exportCatalog() {
    const blob=new Blob([JSON.stringify(catalog,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;link.download='persona-reference-library.json';
    document.body.appendChild(link);link.click();link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    setStatus('Экспортированы только метаданные. Видео и фото в JSON не входят.');
  }
  return <section className="personaReferenceLibrary" aria-label="Библиотека референсов">
    <header className="referenceHead">
      <button className="backButton" type="button" onClick={onBack}>← Мастерская</button>
      <h2>Библиотека референсов</h2>
      <p>Локальный каталог видео, фотографий и документов. Исходники не перемещаются, не удаляются и не загружаются в сеть.</p>
    </header>
    <div className="referenceStats" aria-label="Статистика каталога">
      <div><b>{catalog.items.length}</b><span>Записей</span></div>
      <div><b>{exact.length}</b><span>Точных групп дублей</span></div>
      <div><b>{candidates.length}</b><span>Возможных повторов</span></div>
    </div>
    <div className="referenceImport">
      <h3>Добавить материалы</h3>
      <label className="referenceFileButton">Выбрать файлы с устройства
        <input type="file" multiple accept="video/*,image/*,.pdf,.md,.txt" disabled={busy} onChange={e=>void pickFiles(e)}/>
      </label>
      <label className="referenceFileButton secondary">Импортировать отчёт сканера (.json)
        <input type="file" accept=".json,application/json" disabled={busy} onChange={e=>void pickReport(e)}/>
      </label>
      <p>Выбор файлов сохраняет только название, размер и доступный хеш. Бинарные файлы не сохраняются: после перезагрузки их потребуется выбрать снова для просмотра или монтажа.</p>
      {pendingImport!==null&&<div className="referenceConfirm" role="group" aria-label="Подтверждение импорта">
        <b>Предпросмотр: {pendingImport.length} записей</b>
        <p>{pendingImport.filter(item=>item.type==='video').length} видео · {pendingImport.filter(item=>item.type==='image').length} изображений · {pendingImport.filter(item=>item.type==='document').length} документов</p>
        <div className="referenceActions">
          <button type="button" className="primary" disabled={busy||pendingImport.length===0} onClick={confirmImport}>Подтвердить импорт</button>
          <button type="button" className="ghost" onClick={()=>{setPendingImport(null);setStatus('Импорт отменён.')}}>Отмена</button>
        </div>
      </div>}
    </div>
    {status&&<p className="referenceStatus" role="status">{busy?'Обработка… ':''}{status}</p>}
    <div className="referenceControls">
      <label>Поиск <input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Название или категория"/></label>
      <label>Тип <select value={kind} onChange={e=>setKind(e.target.value as ReferenceKind|'all')}>
        <option value="all">Все</option><option value="video">Видео</option><option value="image">Фото</option><option value="document">Документы</option>
      </select></label>
      <label>Категория <select value={category} onChange={e=>setCategory(e.target.value as ReferenceCategory|'all')}>
        <option value="all">Все категории</option>{REFERENCE_CATEGORIES.map(x=><option key={x} value={x}>{x}</option>)}
      </select></label>
      <label>Сортировка <select value={sort} onChange={e=>setSort(e.target.value as typeof sort)}>
        <option value="name">По имени</option><option value="kind">По типу</option><option value="size">По размеру</option>
      </select></label>
    </div>
    {Object.keys(pendingCategories).length>0&&<div className="referenceConfirm referenceSticky">
      <span>Изменено категорий: {Object.keys(pendingCategories).length}</span>
      <button type="button" className="primary" onClick={confirmCategories}>Подтвердить изменения</button>
      <button type="button" className="ghost" onClick={()=>setPendingCategories({})}>Отменить</button>
    </div>}
    <div className="referenceResults"><h3>Каталог · {filtered.length}</h3>
      {!filtered.length&&<p>Здесь пока нет подходящих материалов. Добавьте исходники или измените фильтры.</p>}
      {filtered.map(item=><article key={item.id} className="referenceCard">
        <div className="referenceCardTop"><span className="referenceKind">{item.type==='video'?'Видео':item.type==='image'?'Фото':'Документ'}</span><span>{fileSize(item.sizeBytes)}</span></div>
        <h4 title={item.name}>{item.name}</h4>
        <p>{item.sha256?'SHA-256 проверяемый':'Без полного SHA-256 · точный дубль не подтверждён'} · {item.source==='inventory'?'Сканер':'Устройство'}</p>
        <label>Категория <select value={pendingCategories[item.id]??item.category} onChange={e=>setPendingCategories(prev=>({...prev,[item.id]:e.target.value as ReferenceCategory}))}>
          {REFERENCE_CATEGORIES.map(x=><option key={x} value={x}>{x}</option>)}
        </select></label>
        <small>{pendingCategories[item.id]!==undefined?'Изменение ожидает подтверждения':item.reviewed?'Категория проверена':'Категория предложена по названию — проверьте'}</small>
      </article>)}
    </div>
    {(exact.length>0||candidates.length>0)&&<details className="referenceDuplicates">
      <summary>Проверить повторы ({exact.length} точных групп, {candidates.length} предположительных)</summary>
      {exact.map((group,i)=><div key={'exact'+i}><b>Точное совпадение SHA-256</b><p>{group.map(x=>x.name).join(' · ')}</p></div>)}
      {candidates.map((group,i)=><div key={'name'+i}><b>Похожие названия — требуется проверка</b><p>{group.map(x=>x.name).join(' · ')}</p></div>)}
      <p>Никакие файлы не удаляются автоматически.</p>
    </details>}
    <div className="referenceExport"><button type="button" className="ghost" disabled={!catalog.items.length} onClick={exportCatalog}>Скачать резервную копию каталога (JSON)</button></div>
  </section>;
}
