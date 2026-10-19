import { useEffect, useMemo, useState } from 'react';
import { backendMode, move, outcome, pendingMoveUndo, today, undoMove } from './api';
import { cacheToday, cachedToday, flush } from './offline';
import { enqueueOutcome } from './outbox';
import ErikaSheet from './ErikaSheet';
import MediaBrainCard from './MediaBrainCard';
import type { Item } from './types';
import './app.css';

const labels: Record<string, string> = { completed: 'Выполнено', partial: 'Частично', moved: 'Перенесено', missed_time: 'Не выполнено вовремя', not_completed: 'Не выполнено' };
const localDate = () => new Date().toLocaleDateString('en-CA');
const tm = (value: string | null) => value ? new Date(value).getTime() : 0;

export default function App() {
  const date = localDate();
  const [items, setItems] = useState<Item[]>(() => cachedToday(date));
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(!navigator.onLine);
  const [erika, setErika] = useState(false);
  const [moving, setMoving] = useState<Item | null>(null);
  const [moveAt, setMoveAt] = useState('');
  const [canUndo, setCanUndo] = useState(() => Boolean(pendingMoveUndo()));
  async function load() { try { const fresh = await today(date); setItems(fresh); cacheToday(date, fresh); setCanUndo(Boolean(pendingMoveUndo())); setError(''); await flush(fresh); } catch (e) { if (!items.length) setError(String(e)); } }
  useEffect(() => { void load(); const online = () => { setOffline(false); void load(); }, off = () => setOffline(true); addEventListener('online', online); addEventListener('offline', off); return () => { removeEventListener('online', online); removeEventListener('offline', off); }; }, []);
  const active = useMemo(() => items.find(i => tm(i.planned_start) > Date.now() && i.status === 'planned'), [items]);
  async function mark(item: Item, command: 'complete' | 'not_complete') { try { await outcome(item, command); await load(); } catch (e) { if (!navigator.onLine) { enqueueOutcome({ itemId: item.id, command, createdAt: new Date().toISOString() }); setOffline(true); } else setError(String(e)); } }
  async function saveMove() { if (!moving || !moveAt) return; try { await move(moving.id, new Date(moveAt).toISOString()); setMoving(null); await load(); } catch (e) { setError(String(e)); } }
  async function restoreMove() { try { const token = pendingMoveUndo(); if (!token) return; await undoMove(token); await load(); } catch (e) { setError(String(e)); } }
  return <main><header><div><small>LIFE OS {backendMode === 'local' ? '· ЛОКАЛЬНО' : ''} {offline ? '· ОФЛАЙН' : ''}</small><h1>Сегодня</h1></div><button className="erika" onClick={() => setErika(true)}>Эрика</button></header>{active && <div className="nowCard"><small>СЛЕДОМ</small><b>{active.title}</b><span>{active.planned_start?.slice(11,16)}</span></div>}<MediaBrainCard />{error && <div className="error">{error}</div>}<section>{items.length === 0 && !error && <p className="empty">На сегодня пока ничего нет. Можно надиктовать план Эрике — он сохранится на этом устройстве.</p>}{items.map(item => <article key={item.id}><div className="time">{item.planned_start?.slice(11,16) || '—'}</div><div className="body"><b>{item.title}</b><span>{labels[item.status] || item.kind}</span></div><button aria-label="Перенести" onClick={() => { setMoving(item); setMoveAt(item.planned_start?.slice(0,16) || ''); }}>↗</button><button aria-label="Выполнено" onClick={() => void mark(item, 'complete')}>✓</button><button aria-label="Не выполнено" onClick={() => void mark(item, 'not_complete')}>×</button></article>)}</section>{moving && <div className="sheetBackdrop"><div className="sheet"><div className="sheetHead"><b>Перенести задачу</b><button onClick={() => setMoving(null)}>×</button></div><span>{moving.title}</span><input aria-label="Дата и время" type="datetime-local" value={moveAt} onChange={e => setMoveAt(e.target.value)} /><button className="send" onClick={() => void saveMove()}>Сохранить перенос</button></div></div>}{canUndo && <div className="toast">Перенос сохранён <button onClick={() => void restoreMove()}>Undo</button></div>}{erika && <ErikaSheet items={items} onClose={() => setErika(false)} onApplied={() => void load()} />}<nav><b>Сегодня</b><a href="#persona-photo">Persona Photo</a><span>Задачи</span><span>Календарь</span></nav></main>;
}
