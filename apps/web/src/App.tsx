import { useEffect, useMemo, useState } from 'react';
import { backendMode, move, outcome, pendingMoveUndo, today, undoMove, allItems } from './api';
import { cacheToday, cachedToday, flush } from './offline';
import { enqueueOutcome } from './outbox';
import ErikaSheet from './ErikaSheet';
import type { Item } from './types';
import './app.css';

const kindLabels: Record<string,string> = { task: 'Задача', event: 'Событие' };
const labels: Record<string, string> = { completed: 'Выполнено', partial: 'Частично', moved: 'Перенесено', missed_time: 'Не выполнено вовремя', not_completed: 'Не выполнено' };
const localDate = () => new Date().toLocaleDateString('en-CA');
const tm = (value: string | null) => value ? new Date(value).getTime() : 0;

export default function App() {
  const date = localDate();
  const [items, setItems] = useState<Item[]>(() => cachedToday(date));
  const [all, setAll] = useState<Item[]>([]);
  const [tab, setTab] = useState<'today'|'tasks'|'calendar'>('today');
  const [calendarDate, setCalendarDate] = useState(date);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(!navigator.onLine);
  const [erika, setErika] = useState(false);
  const [moving, setMoving] = useState<Item | null>(null);
  const [moveAt, setMoveAt] = useState('');
  const [canUndo, setCanUndo] = useState(() => Boolean(pendingMoveUndo()));
  async function load() { try { const fresh = await today(date); setItems(fresh); cacheToday(date, fresh); if (backendMode === 'local') setAll(await allItems()); setCanUndo(Boolean(pendingMoveUndo())); setError(''); await flush(fresh); } catch (e) { if (!items.length) setError(String(e)); } }
  useEffect(() => { void load(); const online = () => { setOffline(false); void load(); }, off = () => setOffline(true); addEventListener('online', online); addEventListener('offline', off); return () => { removeEventListener('online', online); removeEventListener('offline', off); }; }, []);
  const displayItems = tab === 'today' ? items : tab === 'calendar' ? all.filter(item=>item.planned_start?.slice(0,10) === calendarDate) : all;
  const active = useMemo(() => items.find(i => tm(i.planned_start) > Date.now() && i.status === 'planned'), [items]);
  async function mark(item: Item, command: 'complete' | 'not_complete') { try { await outcome(item, command); await load(); } catch (e) { if (!navigator.onLine) { enqueueOutcome({ itemId: item.id, command, createdAt: new Date().toISOString() }); setOffline(true); } else setError(String(e)); } }
  async function saveMove() { if (!moving || !moveAt) return; try { await move(moving.id, new Date(moveAt).toISOString()); setMoving(null); await load(); } catch (e) { setError(String(e)); } }
  async function restoreMove() { try { const token = pendingMoveUndo(); if (!token) return; await undoMove(token); await load(); } catch (e) { setError(String(e)); } }
  return <main>
    <header>
      <div><small>LIFE OS {backendMode === 'local' ? '· НА ЭТОМ УСТРОЙСТВЕ' : ''} {offline ? '· ОФЛАЙН' : ''}</small>
        <h1>{tab === 'today' ? 'Сегодня' : tab === 'tasks' ? 'Задачи' : 'Календарь'}</h1></div>
      <button className="erika" onClick={() => setErika(true)}>Эрика</button>
    </header>
    {tab === 'today' && active && <div className="nowCard"><small>СЛЕДОМ</small><b>{active.title}</b><span>{active.planned_start?.slice(11,16)}</span></div>}
    {tab === 'calendar' && <div className="calendarControl"><label htmlFor="life-calendar-date">Выбрать дату</label><input id="life-calendar-date" type="date" value={calendarDate} onChange={e => setCalendarDate(e.target.value)}/></div>}
    {error && <div className="error" role="alert">{error}</div>}
    <section aria-label={tab === 'today' ? 'Задачи на сегодня' : tab === 'tasks' ? 'Все задачи' : 'Задачи выбранного дня'}>
      {displayItems.length === 0 && !error && <p className="empty">{tab==='today'?'На сегодня задач нет. Добавьте задачу через Эрику.':tab==='tasks'?'Задач пока нет. Добавьте первую через Эрику.':'На выбранную дату задач нет.'}</p>}
      {displayItems.map(item => <article key={item.id}>
        <div className="time">{tab === 'tasks' ? (item.planned_start?.slice(5,10) || '—') : (item.planned_start?.slice(11,16) || '—')}</div>
        <div className="body"><b>{item.title}</b><span>{labels[item.status] || kindLabels[item.kind] || 'Задача'}{tab === 'tasks' && item.planned_start ? ' · ' + item.planned_start.slice(11,16) : ''}</span></div>
        <button aria-label={'Перенести ' + item.title} onClick={() => {setMoving(item);setMoveAt(item.planned_start?.slice(0,16) || '');}}>↗</button>
        <button aria-label={'Выполнено: ' + item.title} onClick={() => void mark(item,'complete')}>✓</button>
        <button aria-label={'Не выполнено: ' + item.title} onClick={() => void mark(item,'not_complete')}>×</button>
      </article>)}
    </section>
    {moving && <div className="sheetBackdrop"><div className="sheet" role="dialog" aria-modal="true" aria-label="Перенести задачу"><div className="sheetHead"><b>Перенести задачу</b><button aria-label="Закрыть перенос" onClick={() => setMoving(null)}>×</button></div><span>{moving.title}</span><input aria-label="Дата и время" type="datetime-local" value={moveAt} onChange={e => setMoveAt(e.target.value)}/><button className="send" onClick={() => void saveMove()}>Сохранить перенос</button></div></div>}
    {canUndo && <div className="toast">Перенос сохранён <button onClick={() => void restoreMove()}>Undo</button></div>}
    {erika && <ErikaSheet items={items} onClose={() => setErika(false)} onApplied={() => void load()} />}
    <nav aria-label="Основная навигация">
      <button className={tab==='today'?'active':''} aria-current={tab==='today'?'page':undefined} onClick={() => {setTab('today');void load();}}>Сегодня</button>
      <button className={tab==='tasks'?'active':''} aria-current={tab==='tasks'?'page':undefined} onClick={() => {setTab('tasks');void load();}}>Задачи</button>
      <button className={tab==='calendar'?'active':''} aria-current={tab==='calendar'?'page':undefined} onClick={() => {setTab('calendar');void load();}}>Календарь</button>
      <a href="#persona-photo">Persona Photo</a>
    </nav>
  </main>;
}
