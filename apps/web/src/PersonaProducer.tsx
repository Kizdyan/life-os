import React, {useEffect, useRef, useState} from 'react';
import type {FormEvent} from 'react';
import {personaWorkerUrl} from './personaWorkerUrl';
import './persona-producer.css';

type Shot = {framing: string; action: string; startSec: number; endSec: number};
type ShotList = {
 id: string;
 idea: string;
 markdown: string;
 plan: {title: string; durationSec: number; hook: string; wardrobe: string; light: string; music: string; shots: Shot[];
  cameraSettings?: string[]; exportSettings?: string[]};
};
type Caption = {label: string; caption: string; hashtags: string[]};
type SocialCopy = {platforms: Record<'tiktok' | 'instagram' | 'vk', Caption>};
type HookTest = {id: string; provider:string; framing?: {warning?:string};
 variants: {index: number; tone: 'intrigue' | 'direct' | 'question'; text: string}[]};
type HookSource = {url: string; token: string; sha256: string; hook: string; startSec:number};

const shotListKey = 'persona.music-studio.last-shot-list';

async function readJson(response: Response) {
 const value = await response.json();
 if (!response.ok) throw Error(value?.error || 'Запрос не завершился.');
 return value;
}

async function workerToken(signal: AbortSignal) {
 const health = await readJson(await fetch(personaWorkerUrl + '/health', {signal}));
 return String(health.token);
}

async function producerPost(url: string, token: string, payload: object, timeout: number) {
 return readJson(await fetch(url, {
  method: 'POST', signal: AbortSignal.timeout(timeout),
  headers: {'Content-Type': 'application/json', 'X-Persona-Worker-Token': token}, body: JSON.stringify(payload),
 }));
}

function downloadShotList(markdown: string) {
 const url = URL.createObjectURL(new Blob([markdown], {type: 'text/markdown; charset=utf-8'}));
 const link = document.createElement('a');
 link.href = url;
 link.download = 'shot_list.md';
 link.click();
 window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function PersonaShotList() {
 const [idea, setIdea] = useState('');
 const [result, setResult] = useState<ShotList | null>(null);
 const [loading, setLoading] = useState(true);
 const [pending, setPending] = useState(false);
 const [error, setError] = useState('');
 const endpoint = personaWorkerUrl + '/preproduction';

 useEffect(() => {
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]);
  async function restore() {
   try {
    const id = localStorage.getItem(shotListKey);
    if (!id || !/^[a-f0-9-]{36}$/.test(id)) return;
    const token = await workerToken(signal);
    const restored: ShotList = await readJson(await fetch(endpoint + '/' + id, {
     signal, headers: {'X-Persona-Worker-Token': token},
    }));
    if (!signal.aborted) {setResult(restored); setIdea(restored.idea);}
   } catch {
    if (!controller.signal.aborted) setError('Последний съёмочный лист сейчас недоступен.');
   } finally {if (!controller.signal.aborted) setLoading(false);}
  }
  void restore();
  return () => controller.abort();
 }, [endpoint]);

 async function create(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if (pending || loading || idea.trim().length < 3) return;
  setPending(true);
  setError('');
  try {
   const token = await workerToken(AbortSignal.timeout(6000));
   const created: ShotList = await producerPost(endpoint, token, {idea, consent: true}, 120000);
   setResult(created);
   try {localStorage.setItem(shotListKey, created.id);} catch { /* The Worker already saved the file. */ }
  } catch (error) {
   setError(error instanceof TypeError ? 'Локальный Media Worker недоступен.' : (error as Error).message);
  } finally {setPending(false);}
 }

 const plan = result?.plan;
 return <section className="personaProducer" aria-label="Съёмочный лист">
  <h2>Съёмочный лист</h2>
  <form onSubmit={create}>
   <label htmlFor="persona-shot-idea">Введите идею ролика</label>
   <input id="persona-shot-idea" value={idea} placeholder="Например, Надежда через тревогу"
    maxLength={600} required disabled={pending} onChange={event => setIdea(event.currentTarget.value)}
    aria-describedby="persona-shot-consent"/>
   <small id="persona-shot-consent">Кнопка отправит текст идеи в OpenRouter.</small>
   <button className="send" disabled={loading || pending || idea.trim().length < 3}>Создать план</button>
  </form>
  {pending && <p role="status">Готовим съёмочный лист…</p>}
  {error && <p role="alert">{error}</p>}
  {plan && result && <article className="personaShootPlan" aria-label="Готовый съёмочный лист">
   {plan.cameraSettings && <>
    <h3>НАСТРОЙКИ КАМЕРЫ (iPhone)</h3>
    <ul>{plan.cameraSettings.map(item => <li key={item}>{item}</li>)}</ul>
   </>}
   <h3>{plan.title}</h3>
   <p>Reels · 9:16 · {plan.durationSec} сек.</p>
   <p><strong>Хук</strong> · {plan.hook}</p>
   <p><strong>Одежда</strong> · {plan.wardrobe}</p>
   <p><strong>Свет</strong> · {plan.light}</p>
   <ol>{plan.shots.map(shot => <li key={shot.startSec}>
    <strong>{shot.startSec}–{shot.endSec} сек. · {shot.framing}</strong><p>{shot.action}</p>
   </li>)}</ol>
   <p><strong>Музыка</strong> · {plan.music}</p>
   {plan.exportSettings && <>
    <h3>НАСТРОЙКИ ЭКСПОРТА (CapCut)</h3>
    <ul>{plan.exportSettings.map(item => <li key={item}>{item}</li>)}</ul>
   </>}
   <button type="button" className="ghost" onClick={() => downloadShotList(result.markdown)}>Скачать shot_list.md</button>
  </article>}
 </section>;
}

export function PersonaSocialCopy({url, token, videoSha256}: {url: string; token: string; videoSha256?: string}) {
 const [result, setResult] = useState<SocialCopy | null>(null);
 const [pending, setPending] = useState(false);
 const [error, setError] = useState('');
 const [copyMessage, setCopyMessage] = useState('');

 async function generate() {
  if (pending) return;
  setPending(true);
  setError('');
  setCopyMessage('');
  try {setResult(await producerPost(url, token, {consent: true, videoSha256}, 190000));}
  catch (error) {setError((error as Error).message);}
  finally {setPending(false);}
 }

 async function copy(text: string, label: string) {
  try {
   await navigator.clipboard.writeText(text);
   setCopyMessage(label + ' · скопировано.');
  } catch {setCopyMessage('Буфер обмена недоступен. Выделите и скопируйте текст вручную.');}
 }

 return <section className="personaProducer personaSocialCopy" aria-label="Тексты для соцсетей">
  <button type="button" className="ghost" disabled={pending}
   aria-describedby="persona-social-consent" onClick={() => void generate()}>Сгенерировать текст для соцсетей</button>
  <small id="persona-social-consent">Кнопка отправит один стоп-кадр готового MP4 в OpenRouter.</small>
  {pending && <p role="status">Описываем кадр и готовим тексты…</p>}
  {error && <p role="alert">{error}</p>}
  {result && <>
   <p>Хэштеги подобраны по теме. Популярность по данным площадок не проверялась.</p>
   {(['tiktok', 'instagram', 'vk'] as const).map(key => {
    const item = result.platforms[key];
    return <article key={key} aria-label={item.label}>
     <h3>{item.label}</h3>
     <p className="personaSocialCaption">{item.caption}</p>
     <button type="button" className="ghost" aria-label={'Копировать текст для ' + item.label}
      onClick={() => void copy(item.caption, item.label)}>Копировать</button>
     {key === 'instagram' && <details><summary>Дополнительные хэштеги для Instagram</summary>
      <p>{item.hashtags.slice(5).join(' ')}</p></details>}
    </article>;
   })}
  </>}
  {copyMessage && <p role="status">{copyMessage}</p>}
 </section>;
}

const toneLabels={intrigue:'Интрига',direct:'Прямой хук',question:'Вопрос'};

export function PersonaHookTests({source}: {source?: HookSource}) {
 const [file,setFile]=useState<File|null>(null);
 const [hook,setHook]=useState(source?.hook??'');
 const [start,setStart]=useState('');
 const [pending,setPending]=useState(false);
 const [error,setError]=useState('');
 const [result,setResult]=useState<{test:HookTest;token:string}|null>(null);
 const staged=useRef<{file:File;id:string;sourceSha256:string;token:string}|null>(null);
 const submitting=useRef(false);
 const endpoint=personaWorkerUrl+'/hook-tests';

 async function create(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if(submitting.current||(!file&&!source)||hook.trim().length<3)return;
  submitting.current=true;
  setPending(true);
  setError('');
  try {
   let target=source;
   if(file){
    const token=await workerToken(AbortSignal.timeout(6000));
    if(staged.current?.file!==file||staged.current.token!==token){
     const job=await readJson(await fetch(endpoint,{method:'PUT',
      headers:{'X-Persona-Worker-Token':token},body:file}));
     staged.current={file,id:job.id,sourceSha256:job.sourceSha256,token};
    }
    target={url:endpoint+'/'+staged.current.id+'/render',token,
     sha256:staged.current.sourceSha256,hook,startSec:0};
   }
   if(!target)throw Error('Выберите MP4 для теста.');
   const hookStartSec=file?Number(start||0):target.startSec;
   const test=await producerPost(target.url,target.token,{hook,consent:true,hookStartSec,videoSha256:target.sha256},360000);
   setResult({test,token:target.token});
  } catch(error) {
   setError(error instanceof TypeError?'Локальный Media Worker недоступен.':(error as Error).message);
  } finally {submitting.current=false;setPending(false);}
 }

 return <section className="personaProducer personaHookTests" aria-label="A/B-тест хука">
  <h3>A/B-тест хука</h3>
  <form aria-label="Варианты для теста" onSubmit={create}>
   <label>{source?'Другой MP4 (необязательно)':'Исходный MP4'}
    <input type="file" accept=".mp4" disabled={pending} onChange={event=>{
     staged.current=null;setFile(event.currentTarget.files?.[0]??null);setResult(null);setError('');
    }}/>
   </label>
   {!file&&!!source?.startSec&&<p>Новый хук начнётся после вшитого титра, на {source.startSec} сек.</p>}
   {file&&<label>Начало нового хука, сек.
    <input type="number" min="0" max="899" step="0.01" value={start} placeholder="С начала"
     disabled={pending} onChange={event=>setStart(event.currentTarget.value)}/>
   </label>}
   <label>Исходный хук
    <input value={hook} maxLength={240} required disabled={pending}
     placeholder="Например, вот где родилась музыка" onChange={event=>setHook(event.currentTarget.value)}/>
   </label>
   <small>OpenRouter получит только текст хука. При сбое поможет локальная модель.</small>
   <button className="ghost" disabled={pending||(!file&&!source)||hook.trim().length<3}>Создать варианты для теста</button>
  </form>
  {pending&&<p role="status">Готовим три хука и собираем MP4…</p>}
  {error&&<p role="alert">{error}</p>}
  {result?.test.provider==='ollama'&&<p role="status">Хуки подготовила локальная модель Ollama.</p>}
  {result?.test.framing?.warning&&<p role="status">{result.test.framing.warning}</p>}
  {result&&<ol aria-label="Готовые варианты для теста">{result.test.variants.map(variant=><li key={variant.index}>
   <p><strong>{toneLabels[variant.tone]}</strong> · {variant.text}</p>
   <a href={endpoint+'/'+result.test.id+'/variant/'+variant.index+'?token='+encodeURIComponent(result.token)}
    download={'variant-'+variant.index+'.mp4'}>Скачать Вариант {variant.index}</a>
  </li>)}</ol>}
 </section>;
}
