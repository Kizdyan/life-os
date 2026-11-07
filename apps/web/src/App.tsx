import React, { useEffect, useMemo, useRef, useState } from 'react';
import { backendMode, today, outcome } from './api';
import { cacheToday, cachedToday, flush } from './offline';
import { enqueueOutcome } from './outbox';
import { deleteLocalTask } from './localRuntime';
import { planLocalDate } from './planner';
import ErikaSheet from './ErikaSheet';
import MediaBrainCard from './MediaBrainCard';
import PersonaFactory from './PersonaFactory';
import DataPortability from './DataPortability';
import LocalTaskEditor from './LocalTaskEditor';
import type { Item } from './types';
import './app.css';

const labels: Record<string, string> = {
  completed: 'Выполнено',
  partial: 'Частично',
  moved: 'Перенесено',
  missed_time: 'Не выполнено вовремя',
  not_completed: 'Не выполнено',
};
function stamp(value: string | null) {
  return value ? new Date(value).getTime() : 0;
}
function cleanError(value: unknown) {
  return value instanceof Error ? value.message : String(value);
}

export default function App() {
  const [viewDate, setViewDate] = useState(() => planLocalDate(new Date()));
  const viewDateRef = useRef(viewDate);
  const [page, setPage] = useState<'today' | 'persona'>(() =>
    location.hash.startsWith('#persona') ? 'persona' : 'today');
  const [items, setItems] = useState<Item[]>(() => cachedToday(planLocalDate(new Date())));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [offline, setOffline] = useState(!navigator.onLine);
  const [erika, setErika] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [mediaOpen, setMediaOpen] = useState(false);

  async function reload(target: string = viewDateRef.current) {
    try {
      const fresh = await today(target);
      if (viewDateRef.current !== target) return;
      setItems(fresh);
      // The cache is only a convenience; it must never replace the runtime's
      // authoritative local data when storage is malformed.
      try { cacheToday(target, fresh); } catch { /* runtime already persisted */ }
      setError('');
      if (backendMode === 'supabase' && navigator.onLine) {
        await flush(fresh);
      }
    } catch (cause) {
      if (viewDateRef.current === target) {
        setError('Не удалось прочитать расписание: ' + cleanError(cause));
      }
    }
  }

  useEffect(() => {
    viewDateRef.current = viewDate;
    void reload(viewDate);
    const online = () => { setOffline(false); void reload(viewDateRef.current); };
    const offlineEvent = () => setOffline(true);
    window.addEventListener('online', online);
    window.addEventListener('offline', offlineEvent);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offlineEvent);
    };
  }, [viewDate]);

  useEffect(() => {
    const sync = () => setPage(location.hash.startsWith('#persona') ? 'persona' : 'today');
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  function chooseDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    viewDateRef.current = value;
    setViewDate(value);
    setItems(cachedToday(value));
    setError('');
    setNotice('');
  }

  async function mark(item: Item, command: 'complete' | 'not_complete') {
    if (busyId !== null) return;
    setBusyId(item.id);
    setError('');
    try {
      if (backendMode === 'supabase' && !navigator.onLine) {
        enqueueOutcome({itemId: item.id, command, createdAt: new Date().toISOString()});
        const status = command === 'complete' ? 'completed' :
          item.carry_forward ? 'missed_time' : 'not_completed';
        const pending = items.map(x => x.id === item.id ? {...x, status} as Item : x);
        setItems(pending);
        cacheToday(viewDateRef.current, pending);
        setNotice('Изменение ожидает синхронизации. На сервере пока не подтверждено.');
        return;
      }
      await outcome(item, command);
      await reload(viewDateRef.current);
      setNotice('Изменение сохранено.');
    } catch (cause) {
      await reload(viewDateRef.current);
      setError('Статус не изменён: ' + cleanError(cause));
    } finally {
      setBusyId(null);
    }
  }

  function removeTask(item: Item) {
    if (backendMode !== 'local') return;
    if (!window.confirm('Удалить задачу «' + item.title + '»? Отменить удаление нельзя.')) return;
    try {
      if (!deleteLocalTask(localStorage, item.id)) {
        throw Error('Задача не найдена. Обнови расписание.');
      }
      setItems(prev => prev.filter(x => x.id !== item.id));
      setNotice('Задача удалена на этом устройстве.');
      setError('');
      void reload(viewDateRef.current);
    } catch (cause) {
      setError('Удаление не выполнено: ' + cleanError(cause));
    }
  }

  function onEdited(item: Item) {
    setEditing(null);
    const updatedDate = item.planned_start?.slice(0, 10);
    if (updatedDate && updatedDate !== viewDateRef.current) {
      chooseDate(updatedDate);
    } else {
      void reload(viewDateRef.current);
    }
    setNotice('Изменения задачи сохранены.');
  }

  function onErikaApplied(changedDate?: string) {
    if (changedDate && changedDate !== viewDateRef.current) {
      chooseDate(changedDate);
    } else {
      void reload(viewDateRef.current);
    }
  }

  const todayDate = planLocalDate(new Date());
  const tomorrowDate = planLocalDate(new Date(), 1);
  const now = Date.now();
  const active = useMemo(() =>
    items.find(i => i.status === 'planned' && i.planned_start &&
      stamp(i.planned_start) <= now && stamp(i.planned_end) > now) ||
    items.find(i => i.status === 'planned' && i.planned_start && stamp(i.planned_start) > now),
    [items, now]);
  const free = useMemo(() => {
    const scheduled = items.filter(i =>
      i.status === 'planned' && i.planned_start && i.planned_end)
      .slice().sort((a,b) => stamp(a.planned_start) - stamp(b.planned_start));
    const intervals: string[] = [];
    for (let i=0; i<scheduled.length-1; i++) {
      const prev = scheduled[i].planned_end!;
      const next = scheduled[i+1].planned_start!;
      if (stamp(next)-stamp(prev) >= 30*60000) {
        intervals.push(prev.slice(11,16) + '–' + next.slice(11,16));
      }
    }
    return intervals.slice(0,3);
  }, [items]);
  const mode = backendMode === 'local' ? ' · ЛОКАЛЬНО' : '';
  const heading = page === 'persona' ? 'Persona' :
    viewDate === todayDate ? 'Сегодня' :
    viewDate === tomorrowDate ? 'Завтра' : 'Расписание';

  return <main>
    <header>
      <div><small>LIFE OS{mode}{offline ? ' · ОФЛАЙН' : ''}</small><h1>{heading}</h1></div>
      <button className="erika" onClick={() => setErika(true)}>Эрика</button>
    </header>
    {page === 'today' ? <>
      <div className="daySwitcher" role="group" aria-label="Выбор даты расписания">
        <button aria-pressed={viewDate===todayDate} className={viewDate===todayDate?'active':''}
          onClick={() => chooseDate(todayDate)}>Сегодня</button>
        <button aria-pressed={viewDate===tomorrowDate} className={viewDate===tomorrowDate?'active':''}
          onClick={() => chooseDate(tomorrowDate)}>Завтра</button>
        <input aria-label="Выбрать дату расписания" type="date" value={viewDate}
          onChange={e => chooseDate(e.target.value)} />
      </div>
      {active && <div className="nowCard">
        <small>{viewDate===todayDate && stamp(active.planned_start)<=now ? 'СЕЙЧАС' : 'ЗАПЛАНИРОВАНО'}</small>
        <b>{active.title}</b>
        <span>{active.planned_start?.slice(11,16)}
          {active.planned_end ? '–'+active.planned_end.slice(11,16) : ''}</span>
      </div>}
      {free.length>0 && <div className="freeRow">
        {free.map((x,i) => <span key={i}>Свободно {x}</span>)}
      </div>}
      <button className="mediaDisclosure" aria-expanded={mediaOpen}
        onClick={() => setMediaOpen(v => !v)}>
        Контент-контур {mediaOpen ? '−' : '+'}
      </button>
      {mediaOpen && <MediaBrainCard />}
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">
        {notice} <button onClick={() => setNotice('')}>Закрыть</button>
      </p>}
      <section>
        {items.length===0 && !error && <p className="empty">
          На {viewDate===todayDate ? 'сегодня' : viewDate===tomorrowDate ? 'завтра' : viewDate}
          {' '}задач пока нет. Добавь их через Эрику.
        </p>}
        {items.map(item => <article key={item.id}
          className={backendMode === 'local' ? 'withTaskActions' : ''}>
          <div className="time">{item.planned_start?.slice(11,16) || '—'}</div>
          <div className="body"><b>{item.title}</b>
            <span>{labels[item.status] || item.kind}</span>
          </div>
          <button aria-label={'Выполнено: '+item.title} title="Выполнено"
            disabled={busyId!==null || item.status==='completed'}
            onClick={() => void mark(item,'complete')}>✓</button>
          <button aria-label={'Не выполнено: '+item.title} title="Не выполнено"
            disabled={busyId!==null || item.status==='not_completed' || item.status==='missed_time'}
            onClick={() => void mark(item,'not_complete')}>×</button>
          {backendMode==='local' && <>
            <button aria-label={'Изменить: '+item.title} title="Изменить задачу"
              disabled={busyId!==null} onClick={() => setEditing(item)}>✎</button>
            <button className="deleteTask" aria-label={'Удалить: '+item.title}
              title="Удалить задачу" disabled={busyId!==null}
              onClick={() => removeTask(item)}>🗑</button>
          </>}
        </article>)}
      </section>
      {backendMode==='local' && <DataPortability />}
    </> : <PersonaFactory />}
    {erika && <ErikaSheet items={items} onClose={() => setErika(false)} onApplied={onErikaApplied}/>}
    {editing && <LocalTaskEditor item={editing}
      onCancel={() => setEditing(null)} onSaved={onEdited}/>}
    <nav className="appNavigation" aria-label="Разделы приложения">
      <button className={page==='today'?'selected':''} aria-current={page==='today'?'page':undefined}
        onClick={() => {setPage('today'); location.hash='today';}}>Сегодня</button>
      <button className={page==='persona'?'selected':''} aria-current={page==='persona'?'page':undefined}
        onClick={() => {setPage('persona'); location.hash='persona';}}>Persona</button>
    </nav>
  </main>;
}
