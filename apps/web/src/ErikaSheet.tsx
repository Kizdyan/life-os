import { useEffect, useRef, useState } from 'react';
import { executeErika } from './erika';
import { applyPlan, today, allItems } from './api';
import { routeErikaSpeech } from './erikaSpeech';
import { createContextualCopy } from './erikaCopy';
import { planCompound } from './planner';
import { autoVoice } from './voiceController';
import { createQuickCapture } from './quickCapture';
import type { Item } from './types';
import './erikaQuickCapture.css';

function localDay() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; }
const day = (items: Item[]) => items.find(x => x.planned_start)?.planned_start?.slice(0, 10) || localDay();
const iso = (d: string, t: string) => `${d}T${t}:00+03:00`;
const fp = (d: string, p: { title: string; start?: string; end?: string }[]) => [d, ...p.map(x => `${x.title.toLowerCase()}:${x.start}:${x.end}`)].join('|');
const LAST_CREATED = 'life-os:erika-last-created:v1';
function rememberCreated(id: string) {
  try { sessionStorage.setItem(LAST_CREATED, JSON.stringify({ id, time: Date.now() })); } catch { /* optional session context */ }
}
function lastCreatedId(): string | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(LAST_CREATED) || 'null');
    if (typeof value?.id === 'string' && typeof value?.time === 'number' &&
        Date.now() - value.time >= 0 && Date.now() - value.time < 20 * 60 * 1000) return value.id;
  } catch { /* expired or unavailable */ }
  return null;
}
function tomorrowLocal(): string {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export default function ErikaSheet({ items, onClose, onApplied }: { items: Item[]; onClose: () => void; onApplied: () => void }) {
  const [text, setText] = useState(''), [message, setMessage] = useState('Слушаю…'), [busy, setBusy] = useState(false);
  const [quickTitle, setQuickTitle] = useState(''), [quickDate, setQuickDate] = useState(() => day(items)), [quickTime, setQuickTime] = useState('09:00'), [quickMessage, setQuickMessage] = useState('');
  const latest = useRef('');
  useEffect(() => autoVoice(t => { latest.current = t; setText(t); }, () => void run(latest.current)), []);

  async function run(value = text) {
    if (!value.trim() || busy) return;
    setBusy(true); setMessage('Обрабатываю…');
    try {
      const route = routeErikaSpeech(value);
      if (route === 'clarify') {
        setMessage('Уточните задачу и дату. Я не буду сохранять текст инструкции как название задачи.');
        return;
      }
      if (route === 'copy-last-tomorrow') {
        const id = lastCreatedId();
        const stored = await allItems();
        const source = id ? stored.find(item => item.id === id) : undefined;
        if (!source?.planned_start) {
          setMessage('Какую именно задачу скопировать? Создайте или выберите исходную задачу — я не буду угадывать.');
          return;
        }
        const targetDate = tomorrowLocal();
        if (source.planned_start.slice(0, 10) === targetDate) {
          setMessage(`«${source.title}» уже запланирована на завтра. Копию не создавала.`);
          return;
        }
        const copyRequest = createContextualCopy(source, targetDate);
        const start = copyRequest.items[0].planned_start;
        const result = await applyPlan(copyRequest.idempotencyKey, copyRequest.items);
        const after = await allItems();
        const copy = after.find(item => result.ids.includes(item.id) && item.title === source.title && item.planned_start === start);
        const original = after.find(item => item.id === source.id);
        if (!copy || original?.planned_start !== source.planned_start || original.title !== source.title)
          throw new Error('Копия не подтверждена или исходная задача изменилась.');
        rememberCreated(copy.id);
        setMessage(`${result.replayed ? 'Копия уже была создана' : 'Скопировала'} «${source.title}» на ${targetDate}, ${start.slice(11,16)}. Исходная задача не изменена.`);
        onApplied();
        return;
      }
      if (route === 'existing') {
        const result = await executeErika(value, items);
        setMessage(result.message);
        if (result.understood) onApplied();
        return;
      }
      const safePlanText = value.replace(/^(?:добавь|запланируй|запиши|поставь в план)\s+/i, '');
      const plan = planCompound(safePlanText, items), d = day(items);
      if (plan.length > 1 || plan.some(x => x.start)) {
        if (plan.some(x => !x.start || !x.end)) { setMessage('Не могу безопасно разместить все пункты. Уточните время или границу дня.'); return; }
        const payload = plan.map(x => ({ title: x.title, kind: 'task', planned_start: iso(d, x.start!), planned_end: iso(d, x.end!) }));
        const result = await applyPlan(fp(d, plan), payload), fresh = await today(d), created = result.ids.filter(id => fresh.some(x => x.id === id));
        if (created.length !== result.ids.length) throw Error('План записан не полностью — требуется повторная проверка');
        if (created.length === 1) rememberCreated(created[0]);
        setMessage(`Готово. В расписание добавлено: ${created.length}.${result.replayed ? ' Повторная команда не создала дублей.' : ''}`); onApplied(); return;
      }
      const result = await executeErika(value, items); setMessage(result.message); if (result.understood) onApplied();
    } catch (error) { setMessage('Не применяю изменения: ' + String(error)); } finally { setBusy(false); }
  }

  async function saveQuickCapture() {
    try {
      const request = createQuickCapture({ title: quickTitle, date: quickDate, time: quickTime });
      setQuickMessage('Сохраняю…');
      const result = await applyPlan(request.idempotencyKey, request.items), fresh = await today(quickDate);
      if (!result.ids.every(id => fresh.some(item => item.id === id))) throw Error('Задача не подтвердилась после сохранения');
      if (result.ids.length === 1) rememberCreated(result.ids[0]);
      setQuickMessage(result.replayed ? 'Эта задача уже есть в расписании.' : 'Задача сохранена в расписании.'); setQuickTitle(''); onApplied();
    } catch (error) { setQuickMessage(error instanceof Error ? error.message : 'Не удалось сохранить задачу'); }
  }

  return <div className="sheetBackdrop" onClick={onClose}><div className="sheet" role="dialog" aria-modal="true" aria-label="Эрика" onClick={event => event.stopPropagation()}>
    <div className="sheetHead"><b>Эрика</b><button aria-label="Закрыть" onClick={onClose}>×</button></div>
    <div className="quickCapture"><h2>Добавить задачу</h2><p>Сохраните одну задачу сразу или опишите день свободной фразой ниже.</p>
      <label>Что сделать<input value={quickTitle} onChange={event => setQuickTitle(event.target.value)} placeholder="Например, репетиция вокала" autoComplete="off" /></label>
      <div className="quickFields"><label>Дата<input aria-label="Дата новой задачи" type="date" value={quickDate} onChange={event => setQuickDate(event.target.value)} /></label><label>Время<input aria-label="Время новой задачи" type="time" value={quickTime} onChange={event => setQuickTime(event.target.value)} /></label></div>
      <button className="send" type="button" disabled={busy} onClick={() => void saveQuickCapture()}>Сохранить задачу</button>{quickMessage && <p className="quickStatus" role="status">{quickMessage}</p>}
    </div>
    <textarea value={text} onChange={event => { latest.current = event.target.value; setText(event.target.value); }} placeholder="Говорите свободно…" /><button className="send" disabled={busy} onClick={() => void run()}>{busy ? 'Обрабатываю…' : 'Выполнить'}</button>{message && <p style={{ whiteSpace: 'pre-line' }}>{message}</p>}
  </div></div>;
}
