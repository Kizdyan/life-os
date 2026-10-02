import { useEffect, useMemo, useState } from 'react';
import { backendMode, outcome, today } from './api';
import { cacheToday, cachedToday, flush } from './offline';
import { enqueueOutcome } from './outbox';
import ErikaSheet from './ErikaSheet';
import MediaBrainCard from './MediaBrainCard';
import RuntimeSyncCard from './RuntimeSyncCard';
import type { Item } from './types';
import './app.css';

const labels: Record<string, string> = {
  completed: 'Выполнено',
  partial: 'Частично',
  moved: 'Перенесено',
  missed_time: 'Не выполнено вовремя',
  not_completed: 'Не выполнено',
};

function localDate(): string {
  const value = new Date();
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function timestamp(value: string | null): number {
  return value ? new Date(value).getTime() : 0;
}

export default function App() {
  const date = localDate();
  const [items, setItems] = useState<Item[]>(() => cachedToday(date));
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(!navigator.onLine);
  const [erika, setErika] = useState(false);
  const [undo, setUndo] = useState<{ item: Item; command: 'complete' | 'not_complete' } | null>(null);

  async function load() {
    try {
      const fresh = await today(date);
      setItems(fresh);
      cacheToday(date, fresh);
      setError('');
      await flush(fresh);
    } catch (cause) {
      if (!items.length) setError(String(cause));
    }
  }

  useEffect(() => {
    void load();
    const online = () => {
      setOffline(false);
      void load();
    };
    const offlineHandler = () => setOffline(true);
    addEventListener('online', online);
    addEventListener('offline', offlineHandler);
    return () => {
      removeEventListener('online', online);
      removeEventListener('offline', offlineHandler);
    };
  }, []);

  const now = Date.now();
  const active = useMemo(
    () => items.find((item) => timestamp(item.planned_start) <= now
      && timestamp(item.planned_end) > now
      && item.status === 'planned')
      || items.find((item) => timestamp(item.planned_start) > now && item.status === 'planned'),
    [items, now],
  );

  const free = useMemo(() => {
    const scheduled = items
      .filter((item) => item.planned_start && item.planned_end)
      .sort((left, right) => timestamp(left.planned_start) - timestamp(right.planned_start));
    const result: string[] = [];
    for (let index = 0; index < scheduled.length - 1; index += 1) {
      const end = scheduled[index].planned_end!;
      const nextStart = scheduled[index + 1].planned_start!;
      if (timestamp(nextStart) - timestamp(end) >= 30 * 60_000) {
        result.push(`${end.slice(11, 16)}–${nextStart.slice(11, 16)}`);
      }
    }
    return result.slice(0, 3);
  }, [items]);

  async function mark(item: Item, command: 'complete' | 'not_complete') {
    setUndo({ item, command });
    const next = items.map((candidate) => candidate.id === item.id
      ? {
        ...candidate,
        status: command === 'complete'
          ? 'completed'
          : item.carry_forward
            ? 'missed_time'
            : 'not_completed',
      } as Item
      : candidate);
    setItems(next);
    cacheToday(date, next);

    try {
      await outcome(item, command);
      setError('');
    } catch (cause) {
      if (!navigator.onLine) {
        enqueueOutcome({ itemId: item.id, command, createdAt: new Date().toISOString() });
        setOffline(true);
      } else {
        setItems(items);
        cacheToday(date, items);
        setError(String(cause));
      }
    }
  }

  const mode = backendMode === 'remote'
    ? '· СИНХРОНИЗАЦИЯ'
    : backendMode === 'legacy-supabase'
      ? '· LEGACY'
      : '· ЛОКАЛЬНО';

  return (
    <main>
      <header>
        <div>
          <small>LIFE OS {mode} {offline ? '· ОФЛАЙН' : ''}</small>
          <h1>Сегодня</h1>
        </div>
        <button className="erika" onClick={() => setErika(true)}>Эрика</button>
      </header>

      {active && (
        <div className="nowCard">
          <small>{timestamp(active.planned_start) <= now ? 'СЕЙЧАС' : 'СЛЕДОМ'}</small>
          <b>{active.title}</b>
          <span>
            {active.planned_start?.slice(11, 16)}
            {active.planned_end ? `–${active.planned_end.slice(11, 16)}` : ''}
          </span>
        </div>
      )}

      {free.length > 0 && (
        <div className="freeRow">
          {free.map((value) => <span key={value}>Свободно {value}</span>)}
        </div>
      )}

      <RuntimeSyncCard onConnected={() => void load()} />
      <MediaBrainCard />

      {error && <div className="error">{error}</div>}

      <section>
        {items.length === 0 && !error && (
          <p className="empty">
            На сегодня пока ничего нет. Можно надиктовать план Эрике — он сохранится локально
            {backendMode === 'remote' ? ' и синхронизируется с долговечной памятью.' : '.'}
          </p>
        )}
        {items.map((item) => (
          <article key={item.id}>
            <div className="time">{item.planned_start?.slice(11, 16) || '—'}</div>
            <div className="body">
              <b>{item.title}</b>
              <span>{labels[item.status] || item.kind}</span>
            </div>
            <button aria-label="Выполнено" onClick={() => void mark(item, 'complete')}>✓</button>
            <button aria-label="Не выполнено" onClick={() => void mark(item, 'not_complete')}>×</button>
          </article>
        ))}
      </section>

      {undo && (
        <div className="toast">
          Изменение сохранено
          <button onClick={() => { setUndo(null); void load(); }}>Обновить</button>
        </div>
      )}

      {erika && (
        <ErikaSheet
          items={items}
          onClose={() => setErika(false)}
          onApplied={() => void load()}
        />
      )}

      <nav>
        <b>Сегодня</b>
        <span>Неделя</span>
        <span>Задачи</span>
        <span>Календарь</span>
      </nav>
    </main>
  );
}
