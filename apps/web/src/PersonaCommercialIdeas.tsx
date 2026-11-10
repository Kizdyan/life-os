import React,{useEffect,useRef,useState} from 'react';
import {contentFormats,readCommercialDevelopment,type PersonaCommercialDevelopment,type CommercialProposal} from './personaCommercialDevelopment';
import {auditCriteria} from '../../../packages/core/src/persona-idea-audit.mjs';
const worker='http://127.0.0.1:47832';
const criteria={visuality:'Визуальность',actingRange:'Актёрский диапазон',sellingPotential:'Продающий потенциал',hook:'Хук'};
export function PersonaCommercialIdeas({projectId,record,creativeSnapshot,onSave,onApplyBrief}:{projectId:string;record:PersonaCommercialDevelopment|null;creativeSnapshot:string;onSave:(r:PersonaCommercialDevelopment)=>boolean;onApplyBrief:(brief:unknown,base:string)=>void}){
 const current=record??{version:1 as const,format:'showcase' as const,proposals:[]};
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const alive=useRef(true),running=useRef(false),latest=useRef(creativeSnapshot);latest.current=creativeSnapshot;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 const audited=current.proposals.filter(p=>p.contentFormat===current.format&&p.audit);
 const proposal=audited[audited.length-1];
 const history=current.proposals.filter(p=>p.id!==proposal?.id);
 async function request(path:string,body:unknown){
  const health=await (await fetch(worker+'/health')).json();
  if(!health.components?.ollama)throw Error('Локальная Qwen недоступна');
  const response=await fetch(worker+path,{method:'POST',headers:{'Content-Type':'application/json','X-Persona-Worker-Token':health.token},body:JSON.stringify(body)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Qwen request failed');return data;
 }
 async function generate(){
  if(running.current||current.proposals.length>=100)return;
  const base=creativeSnapshot;running.current=true;setBusy(true);setError('');
  try{
   const nextProposal=await request('/ideas',{projectId,contentFormat:current.format,theme:'Показать актёрский диапазон, режиссуру и собственную музыку автора в оригинальной снимаемой сцене с уместным продающим финалом.'}) as CommercialProposal;
   if(!alive.current)return;
   if(latest.current!==base)throw Error('Сценарий изменился; новый ответ не применяется.');
   if(!nextProposal.audit)throw Error('Worker не выполнил обязательную самокритику. Обновите локальный Worker.');
   const next={...current,proposals:[...current.proposals,nextProposal]};
   if(!readCommercialDevelopment(next)||!onSave(next))throw Error('Не удалось сохранить проверенное предложение; прежние версии не удалены.');
  }catch(e){if(alive.current)setError(String((e as Error).message))}
  finally{running.current=false;if(alive.current)setBusy(false)}
 }
 async function screenplay(proposalId:string,ideaId:string){
  if(running.current)return;
  const base=creativeSnapshot;running.current=true;setBusy(true);setError('');
  try{
   const result=await request('/ideas/'+proposalId+'/select',{projectId,ideaId});
   if(!alive.current)return;
   if(latest.current!==base)throw Error('Проект изменился во время генерации; импорт отменён.');
   if(!onSave({...current,selected:{proposalId,ideaId}}))throw Error('Выбор не сохранён');
   onApplyBrief(result.brief,base);
  }catch(e){if(alive.current)setError(String((e as Error).message))}
  finally{running.current=false;if(alive.current)setBusy(false)}
 }
 return <section className="captureCard personaAiMediaWorker" aria-label="Продающий формат и локальная Qwen">
  <h3>Showcase &amp; Sell · Генератор → Критик → ТОП-2</h3>
  <label>Стилевая вариация<select aria-label="Формат контента" value={current.format} disabled={busy} onChange={e=>{if(!onSave({...current,format:e.target.value as typeof current.format}))setError('Формат не сохранён')}}>{contentFormats.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
  <p>Qwen создаёт 5 полных пакетов по трём авторским эталонам и редактируемому архетипу. Продюсер-критик проверяет продающий потенциал, актёрский диапазон и визуальность. Код оставляет не больше двух идей со средней оценкой от 8/10.</p>
  <p>Это самокритика одной модели, не независимое жюри и не измерение спроса или вероятности успеха. Авторское утверждение остаётся отдельным.</p>
  <button type="button" disabled={busy||current.proposals.length>=100} onClick={()=>void generate()}>{busy?'Qwen: генерация и аудит…':'Создать качественную идею'}</button>
  {current.proposals.length>=100&&<p>Сохранено 100 версий. Старые данные не удалены; создайте отдельный проект для следующего набора.</p>}
  {busy&&<p role="status">Реальные локальные проходы: 5 пакетов → строгий аудит 3 критериев → отсев. На CPU каждый проход ограничен 10 минутами.</p>}
  {error&&<p role="alert">{error}</p>}
  {proposal?.audit&&<div aria-label="Результат аудита идей">
   <small>{contentFormats.find(f=>f.id===proposal.contentFormat)?.label} · {proposal.provider.model} · два прохода той же модели</small>
   {proposal.archetype&&<p>Архетип этой редакции: {proposal.archetype.description}</p>}
   {proposal.ideas.length===0&&<p role="status">Все 5 идей отсеяны. Ни одна не прошла порог 8/10; сценарий не создаётся.</p>}
   {proposal.ideas.length===1&&<p>Порог прошла только одна идея. Вторую система не подставляет.</p>}
   {proposal.ideas.map(idea=>{
    const review=proposal.audit!.reviews.find(r=>r.ideaId===idea.id)!;
    return <article key={idea.id} aria-label={'Проверенная идея '+idea.id}>
     <h4>{idea.title}</h4>
     <p><b>Средняя оценка критика: {review.average}/10</b></p>
     <ul>{auditCriteria(proposal.audit!.version).map(k=><li key={k}>{criteria[k]}: {review.scores[k]}/10</li>)}</ul>
     <p><b>Почему прошла:</b> {review.reason}</p>
     <p><b>Хук:</b> {idea.hook}</p><p>{idea.angle}</p>
     {idea.skills.map(s=><p key={s.role}><b>{{actor:'Актёр',director:'Режиссёр',composer:'Композитор'}[s.role]}:</b> {s.action}</p>)}
     <p><b>Музыка:</b> {idea.music}</p><p><b>Актёрская задача:</b> {idea.actingTask}</p><p><b>Финал:</b> {idea.sellingEnding}</p>
     {idea.productionPackage&&<div aria-label={'Полный продакшн-пакет '+idea.id}><h5>Полный продакшн-пакет</h5>
      <p><b>Свет:</b> {idea.productionPackage.visualStyle.lighting}<br/><b>Цвет:</b> {idea.productionPackage.visualStyle.colors}</p>
      <p><b>Лейтмотив:</b> {idea.productionPackage.musicalLeitmotif.instruments}<br/><b>Кульминация:</b> {idea.productionPackage.musicalLeitmotif.climax}</p>
      <p><b>Склейки:</b> {idea.productionPackage.editingRhythm.cuts}<br/><b>Паузы:</b> {idea.productionPackage.editingRhythm.pauses}</p>
      <small>Замысел до съёмки; точные границы появятся только после анализа настоящих дублей.</small>
     </div>}
     <button disabled={busy} onClick={()=>void screenplay(proposal.id,idea.id)}>Выбрать и создать сценарий</button>
    </article>;
   })}
   <details><summary>Почему остальные отсеяны</summary>{proposal.audit.reviews.filter(r=>r.decision!=='selected').map(r=><div key={r.ideaId}>
    <h5>{r.title} · {r.average}/10</h5>
    <p>{r.decision==='below_threshold'?'Средний балл ниже 8.':'Порог пройден, но идея уступила двум лидерам.'}</p>
    <p>{r.reason}</p>{r.appliedRules.map(rule=><p key={rule}>{rule}</p>)}
   </div>)}</details>
  </div>}
  {history.length>0&&<details><summary>Сохранённые предыдущие версии: {history.length}</summary><p>История сохранена. Версии без аудита не предлагаются как прошедшие отбор; существующие сценарии доступны на этапе «Сценарий».</p><ul>{history.map(p=><li key={p.id}>{contentFormats.find(f=>f.id===p.contentFormat)?.label} · {p.provider.model} · {p.audit?'аудит сохранён':'без аудита'} · {p.ideas.map(i=>i.title).join('; ')}</li>)}</ul></details>}
 </section>;
}
