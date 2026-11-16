
import React, {useRef, useState} from 'react';
import type {FormEvent} from 'react';
import formats from '../../../packages/core/src/persona-music-formats.json';
import {personaWorkerUrl} from './personaWorkerUrl';
import {PersonaHookTests, PersonaShotList, PersonaSocialCopy} from './PersonaProducer';
import './persona-music-studio.css';

type Candidate = {id: string; startSec: number; endSec: number};
type Analysis = {id: string; token: string; candidates: Candidate[]};
type RenderResult = {
 video: {durationSec: number; path: string; sha256: string};
 framing?: {warning?: string};
 hooks?: {endSec:number}[];
 timing?: {totalMs:number; renderAndQaMs:number; loggingWarning?:string};
 audio: {mode: 'auto' | 'original'; source: 'camera' | 'silence'; music?: {file: string; mood: string; warning?: string; visionWarning?: string}};
};

function timestamp(seconds: number) {
 const minutes = Math.floor(seconds / 60);
 const remainder = (seconds % 60).toFixed(2).padStart(5, '0');
 return minutes + ':' + remainder;
}

export default function PersonaMusicStudio() {
 const [file, setFile] = useState<File | null>(null);
 const [autoMusic, setAutoMusic] = useState(false);
 const [captionStyle, setCaptionStyle] = useState('cinematic');
 const [format, setFormat] = useState('Format_OneEmotion');
 const [analysis, setAnalysis] = useState<Analysis | null>(null);
 const [result, setResult] = useState<RenderResult | null>(null);
 const [error, setError] = useState('');
 const [pending, setPending] = useState<'analysis' | 'render' | null>(null);
 const source = useRef<HTMLVideoElement>(null);
 const previewEnd = useRef<number | null>(null);
 const jobUrl = analysis ? personaWorkerUrl + '/music-studio/' + analysis.id : '';

 function reset() {
  source.current?.pause();
  previewEnd.current = null;
  setAnalysis(null);
  setResult(null);
  setError('');
 }

 async function prepare(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if (!file || pending) return;
  const clickedAt = Date.now();
  reset();
  setPending('analysis');
  try {
   const healthResponse = await fetch(personaWorkerUrl + '/health', {signal: AbortSignal.timeout(6000)});
   if (!healthResponse.ok) throw Error('Запустите локальный Media Worker.');
   const health = await healthResponse.json();
   if (!health.musicStudio) throw Error('Подключите Humble LUT в локальном Media Worker.');
   const options = new URLSearchParams({format, extension: file.name.slice(file.name.lastIndexOf('.')), clickedAt: String(clickedAt)});
   const response = await fetch(personaWorkerUrl + '/music-studio?' + options, {
    method: 'PUT', headers: {'X-Persona-Worker-Token': health.token}, body: file,
   });
   const body = await response.json();
   if (!response.ok) throw Error(body.error || 'Не удалось проанализировать видео.');
   setAnalysis({id: body.id, token: health.token, candidates: body.analysis.candidates});
  } catch (error) {
   setError(error instanceof TypeError ? 'Локальный Media Worker недоступен.' : (error as Error).message);
  } finally {
   setPending(null);
  }
 }

 async function preview(candidate: Candidate) {
  const video = source.current;
  if (!video) return;
  previewEnd.current = candidate.endSec;
  video.currentTime = candidate.startSec;
  try {
   await video.play();
  } catch {
   setError('Браузер не смог воспроизвести исходник. Попробуйте MP4 с H.264 и AAC.');
  }
 }

 async function render(candidate: Candidate) {
  if (!analysis || pending) return;
  source.current?.pause();
  setPending('render');
  setError('');
  try {
   const response = await fetch(jobUrl + '/render', {
    method: 'POST', headers: {'Content-Type': 'application/json', 'X-Persona-Worker-Token': analysis.token},
    body: JSON.stringify({candidateId: candidate.id, approved: true, autoMusic, captionStyle}),
   });
   const body = await response.json();
   if (!response.ok) throw Error(body.error || 'Не удалось собрать MP4.');
   setResult(body);
  } catch (error) {
   setError((error as Error).message);
  } finally {
   setPending(null);
  }
 }

 return <div className="musicStudio">
  <PersonaShotList/>
  <form onSubmit={prepare}>
   <label>Музыкальная сессия
    <input type="file" accept=".mp4,.mov,.mkv,.webm,.m4v" disabled={Boolean(pending)}
     onChange={event => {reset(); setFile(event.currentTarget.files?.[0] ?? null);}}/>
   </label>
   <label>Формат
    <select value={format} disabled={Boolean(pending)} onChange={event => {reset(); setFormat(event.target.value);}}>
     {formats.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
    </select>
   </label>
   <label>Стиль титров
    <select value={captionStyle} disabled={Boolean(pending)}
     onChange={event => {setCaptionStyle(event.currentTarget.value); setResult(null); setError('');}}>
     <option value="cinematic">Cinematic (Cormorant)</option>
     <option value="dynamic-interview">Dynamic Interview (Montserrat)</option>
     <option value="signature-gold">Signature Gold · Quiet Luxury v1.0</option>
    </select>
   </label>
   <div className="musicActions">
    <label className="musicToggle">
     <input type="checkbox" role="switch" checked={autoMusic} disabled={Boolean(pending)}
      aria-describedby={autoMusic ? 'music-auto-note' : undefined}
      onChange={event => {setAutoMusic(event.currentTarget.checked); setResult(null); setError('');}}/>
     <span>Автоподбор музыки</span>
     <span aria-hidden="true">{autoMusic ? 'Вкл' : 'Выкл'}</span>
    </label>
    <button className="send" disabled={!file || Boolean(pending)}>Собрать</button>
   </div>
   {autoMusic && <small id="music-auto-note">Два стоп-кадра выбранного фрагмента отправятся в OpenRouter для подбора по настроению.</small>}
  </form>
  {pending && <p role="status">{pending === 'analysis' ? 'Ищем фрагменты…' : 'Собираем и проверяем MP4…'}</p>}
  {error && <p className="error" role="alert">{error}</p>}
  {analysis && !result && <section aria-label="Кандидаты">
   <h2>Выбери фрагмент</h2>
   <video ref={source} controls preload="metadata" src={jobUrl + '/source?token=' + encodeURIComponent(analysis.token)}
    onTimeUpdate={event => {
     if (previewEnd.current !== null && event.currentTarget.currentTime >= previewEnd.current) event.currentTarget.pause();
    }}/>
   {analysis.candidates.map(candidate => <div className="musicCandidate" key={candidate.id}>
    <span>{timestamp(candidate.startSec)} – {timestamp(candidate.endSec)}</span>
    <button type="button" disabled={Boolean(pending)} onClick={() => void preview(candidate)}>Посмотреть фрагмент</button>
    <button type="button" disabled={Boolean(pending)} onClick={() => void render(candidate)}>Выбрать и собрать</button>
   </div>)}
  </section>}
  {result && analysis && <section aria-label="Готовый ролик">
   <h2>MP4 для просмотра</h2>
   <video controls preload="metadata" src={jobUrl + '/video?token=' + encodeURIComponent(analysis.token)}/>
   <p><a href={jobUrl + '/video?download=1&token=' + encodeURIComponent(analysis.token)} download="music-reel.mp4">Скачать MP4</a></p>
   <p>{result.audio.music ? 'Музыка · ' + result.audio.music.file : result.audio.source === 'camera' ? 'Звук с камеры' : 'Тишина'}</p>
   {result.audio.music?.warning && <p role="status">{result.audio.music.warning}</p>}
   {result.audio.music?.visionWarning && <p role="status">{result.audio.music.visionWarning}</p>}
   {result.framing?.warning && <p role="status">{result.framing.warning}</p>}
   {result.timing && <p>От запуска до готовности {(result.timing.totalMs/1000).toFixed(1)} с. Рендер и проверка {(result.timing.renderAndQaMs/1000).toFixed(1)} с.</p>}
   {result.timing?.loggingWarning && <p role="status">{result.timing.loggingWarning}</p>}
   <p>Файл на компьютере <code>{result.video.path}</code></p>
  </section>}
  <section aria-label="Выпуск">
   <h2>Выпуск</h2>
   {result&&analysis&&<PersonaSocialCopy key={result.video.sha256} url={jobUrl + '/social-copy'} token={analysis.token}
    videoSha256={result.video.sha256}/>}
   <PersonaHookTests key={result?.video.sha256??'upload'} source={result&&analysis?{
    url:jobUrl+'/hook-tests',token:analysis.token,sha256:result.video.sha256,
    hook:formats.find(item=>item.id===format)?.hook??'',
    startSec:result.hooks?.[0]?.endSec??0,
   }:undefined}/>
  </section>
 </div>;
}
