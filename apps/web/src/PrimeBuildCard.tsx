import { useEffect, useMemo, useState } from 'react';
import { allItems, outcome, undoOutcome, type OutcomeSyncMeta } from './api';
import { readAllLocalItems } from './localRuntime';
import type { Item } from './types';
import {
  PRIME_CATEGORIES, PRIME_PRINCIPLE, PRIME_TITLE, beginPrimeBuild,
  completePrimeReflectionTask, ensurePrimeWeek, logPrimeEvent, primeActionId,
  primeDate, primeWeek, primeWeeklySummary, readPrimeJournal, readPrimeSettings,
  savePrimeReflection, setPrimeOutreachLimit, undoPrimeJournalLast,
  type PrimeCategory, type PrimeEvent, type PrimeSettings, type PauseOutcome,
} from './primeBuild';
import './prime-build.css';

type UndoState = { item: Item; successorId: string | null; sync: OutcomeSyncMeta };
const cats = Object.keys(PRIME_CATEGORIES) as PrimeCategory[];
const today = () => primeDate();
function nowISO() { return new Date().toISOString(); }

export default function PrimeBuildCard({ onChanged }: { onChanged: () => void }) {
  const [settings, setSettings] = useState<PrimeSettings | null>(() => readPrimeSettings(localStorage));
  const [items, setItems] = useState<Item[]>([]);
  const [events, setEvents] = useState<PrimeEvent[]>(() => readPrimeJournal(localStorage).events);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [outreachContext, setOutreachContext] = useState('');
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [answers, setAnswers] = useState<[string, string, string]>(() => readPrimeJournal(localStorage).events.find(e => e.type === 'reflection' && !e.voided && e.date === primeDate())?.answers ?? ['', '', '']);
  const [selfRespect, setSelfRespect] = useState(() => String(readPrimeJournal(localStorage).events.find(e => e.type === 'reflection' && !e.voided && e.date === primeDate())?.selfRespect ?? ''));
  const [alignment, setAlignment] = useState(() => String(readPrimeJournal(localStorage).events.find(e => e.type === 'reflection' && !e.voided && e.date === primeDate())?.alignment ?? ''));
  const d = today();
  const refresh = () => {
    setEvents(readPrimeJournal(localStorage).events);
    setSettings(readPrimeSettings(localStorage));
    setItems(readAllLocalItems(localStorage));
  };
  useEffect(() => {
    let alive = true;
    void allItems().then(xs => { if (alive) setItems(xs); });
    const onSync = () => { void refresh(); };
    addEventListener('lifeos-runtime-sync', onSync);
    addEventListener('prime-build-updated', onSync);
    return () => {
      alive = false;
      removeEventListener('lifeos-runtime-sync', onSync);
      removeEventListener('prime-build-updated', onSync);
    };
  }, []);
  useEffect(() => {
    if (!settings || !primeWeek(settings, d)) return;
    void ensurePrimeWeek(settings, d).then(refresh).catch(() => setError('Не удалось восстановить задачи Prime Build.'));
  }, [settings?.startDate, d]);
  const wk = useMemo(() => settings ? primeWeeklySummary(settings, d, items, events) : null, [settings, d, items, events]);
  const activePause = useMemo(() => events.filter(e => !e.voided && e.type === 'pause' && !e.outcome).at(-1), [events]);
  const isActive = Boolean(settings && wk);
  async function start() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const s = beginPrimeBuild(localStorage, d);
      await ensurePrimeWeek(s, d);
      setSettings(s);
      await refresh();
      onChanged();
    } catch {
      setError('Не удалось создать Prime Build. Попробуй ещё раз.');
    } finally { setBusy(false); }
  }
  async function mark(category: PrimeCategory) {
    if (!wk || !settings || busy) return;
    const item = items.find(i => i.id === primeActionId(settings, wk.index, category));
    if (!item || item.status === 'completed') return;
    setBusy(true);
    try {
      const result = await outcome(item, 'complete');
      if (result && typeof result === 'object' && 'sync' in result)
        setUndo({ item, successorId: result.successor?.id ?? null, sync: result.sync });
      await refresh();
      onChanged();
    } catch { setError('Не удалось отметить действие.'); }
    finally { setBusy(false); }
  }
  async function reverse() {
    if (!undo) return;
    const last = undo;
    setUndo(null);
    setBusy(true);
    try { await undoOutcome(last.item, last.successorId, last.sync); await refresh(); onChanged(); }
    catch { setError('Не удалось отменить изменение.'); }
    finally { setBusy(false); }
  }
  function log(type: PrimeEvent['type'], options?: { outcome?: PauseOutcome; id?: string }) {
    logPrimeEvent(localStorage, { type, date: d,
      ...(type === 'new_outreach' && outreachContext.trim() ? { detail: outreachContext.trim().slice(0, 500) } : {}),
      ...options });
    if (type === 'new_outreach') setOutreachContext('');
    setEvents(readPrimeJournal(localStorage).events);
    window.dispatchEvent(new Event('prime-build-updated'));
  }
  async function saveCheckin() {
    if (!settings || busy) return;
    if (!answers.some(x => x.trim())) { setError('Напиши хотя бы одну короткую мысль.'); return; }
    setBusy(true);
    try {
      savePrimeReflection(localStorage, d, answers,
        selfRespect ? Number(selfRespect) : undefined, alignment ? Number(alignment) : undefined);
      await completePrimeReflectionTask(d);
      setError('');
      await refresh();
      onChanged();
    } catch { setError('Не удалось сохранить вечернюю запись.'); }
    finally { setBusy(false); }
  }
  if (!settings) return <section className="primeCard" aria-label={PRIME_TITLE}>
    <small>PRIME BUILD · 30 ДНЕЙ</small>
    <h2>Строить свою жизнь, не ждать подтверждения</h2>
    <p>{PRIME_PRINCIPLE}</p>
    <button className="primePrimary" disabled={busy} onClick={() => void start()}>
      {busy ? 'Подключаю к Life OS…' : 'Начать 30 дней'}
    </button>
    {error && <p role="alert">{error}</p>}
  </section>;
  if (!isActive || !wk) return <section className="primeCard">
    <small>PRIME BUILD</small><h2>30 дней пройдены</h2><p>Проект остаётся в истории Life OS. Твои выполненные действия сохранены в задачах.</p>
  </section>;
  const saved = events.find(e => e.type === 'reflection' && !e.voided && e.date === d);
  const reflected = Boolean(saved);
  const elapsed = activePause ? Math.max(0, Math.floor((Date.now() - new Date(activePause.createdAt).getTime()) / 60000)) : 0;
  return <section className="primeCard" aria-label={PRIME_TITLE}>
    <small>PRIME BUILD · ДЕНЬ {Math.min(30, dayNumber(settings.startDate, d))} / 30</small>
    <h2>Интерес — сразу. Значимость — после взаимности.</h2>
    <div className="primeStats"><b>{wk.complete}/5 действий</b><span>Неделя {wk.index + 1} · Prime Alignment {wk.primeAlignment}%</span></div>
    <div className="primeActions">
      {cats.map(c => <button type="button" key={c} disabled={busy || wk.flags[c]}
        className={wk.flags[c] ? 'primeDone' : ''} onClick={() => void mark(c)}>
        <span>{wk.flags[c] ? '✓' : '○'} {PRIME_CATEGORIES[c]}</span>
        <small>{wk.flags[c] ? 'Сделано' : 'Отметить'}</small>
      </button>)}
    </div>
    {undo && <button type="button" className="primeLink" disabled={busy} onClick={() => void reverse()}>Отменить последнее действие</button>}
    <details className="primeDetails"><summary>Общение и импульсы · приватно</summary>
      <p>Новых инициатив: <b>{wk.outreach}</b> · ориентир на неделю: {settings.outreachLimit} · осталось: {wk.remaining}</p>
      <label>Мой недельный ориентир
        <select aria-label="Недельный ориентир новых инициатив" value={settings.outreachLimit}
          onChange={e => { setSettings(setPrimeOutreachLimit(localStorage, Number(e.target.value))); }}>
          {Array.from({ length: 11 }, (_, i) => <option key={i} value={i}>{i}</option>)}
        </select>
      </label>
      {wk.outreach >= settings.outreachLimit && <p>Ориентир достигнут. Это не запрет — решение остаётся за тобой.</p>}
      <label>Контекст новой инициативы (необязательно, только на этом устройстве)
        <input aria-label="Контекст инициативы — приватно" value={outreachContext} maxLength={500}
          onChange={e => setOutreachContext(e.target.value)} placeholder="Например: познакомился на мероприятии" />
      </label>
      <div className="primeButtonRow">
        <button type="button" onClick={() => log('new_outreach')}>+ Новая инициатива</button>
        <button type="button" onClick={() => log('pause')}>Пауза 10 минут</button>
      </div>
      {activePause && <div className="primePause">
        <p>Мне интересна именно она или сейчас нужно подтверждение, что я могу понравиться?</p>
        <small>Прошло {elapsed} мин · пауза добровольная, без блокировок</small>
        <div className="primeButtonRow">
          <button type="button" onClick={() => log('pause', { id: activePause.id, outcome: 'interested' })}>Интерес остался</button>
          <button type="button" onClick={() => log('pause', { id: activePause.id, outcome: 'skip' })}>Пропущу</button>
          <button type="button" onClick={() => log('pause', { id: activePause.id, outcome: 'postpone' })}>Отложу</button>
        </div>
      </div>}
      <button type="button" className="primeLink" onClick={() => log('validation')}>Отметить поиск подтверждения без осуждения</button>
      <button type="button" className="primeLink" onClick={() => { if (undoPrimeJournalLast(localStorage)) { setEvents(readPrimeJournal(localStorage).events); window.dispatchEvent(new Event('prime-build-updated')); } }}>Отменить последнюю приватную запись</button>
      <small>Паузы: {wk.pauses} · моменты внешнего подтверждения: {wk.validationMoments}. Эти записи остаются только на этом устройстве.</small>
    </details>
    <details className="primeDetails" open={!reflected}><summary>Вечерние 2 минуты {reflected ? '✓' : ''}</summary>
      <label>Что сегодня сделало меня сильнее?
        <textarea rows={2} value={answers[0]} onChange={e => setAnswers(a => [e.target.value, a[1], a[2]])} />
      </label>
      <label>Где сегодня я искал внешнее подтверждение?
        <textarea rows={2} value={answers[1]} onChange={e => setAnswers(a => [a[0], e.target.value, a[2]])} />
      </label>
      <label>Что завтра я сделаю для себя, даже если никто этого не увидит?
        <textarea rows={2} value={answers[2]} onChange={e => setAnswers(a => [a[0], a[1], e.target.value])} />
      </label>
      <div className="primeScores">
        <label>Самоуважение
          <select value={selfRespect} onChange={e => setSelfRespect(e.target.value)}>
            <option value="">—</option>{Array.from({ length: 10 }, (_, i) => <option key={i} value={i + 1}>{i + 1}/10</option>)}
          </select>
        </label>
        <label>Prime Alignment
          <select value={alignment} onChange={e => setAlignment(e.target.value)}>
            <option value="">—</option>{Array.from({ length: 10 }, (_, i) => <option key={i} value={i + 1}>{i + 1}/10</option>)}
          </select>
        </label>
      </div>
      <button className="primePrimary" disabled={busy} onClick={() => void saveCheckin()}>{reflected ? 'Обновить запись' : 'Сохранить 2 минуты'}</button>
    </details>
    <details className="primeDetails"><summary>Обзор недели</summary>
      <p>Тело / осанка {wk.flags.body ? '✓' : '○'} · Стиль / уход {wk.flags.style ? '✓' : '○'}</p>
      <p>Сильный контекст {wk.flags.strong ? '✓' : '○'} · Социальная жизнь {wk.flags.social ? '✓' : '○'}</p>
      <p>Съёмка {wk.flags.capture ? '✓' : '○'} · Рефлексии: {wk.checkins}</p>
      <b>На этой неделе я больше строил свою жизнь или ждал подтверждения извне?</b>
      {wk.index > 0 && <small>Сравнения и выводы появятся только после накопления сопоставимых недель.</small>}
    </details>
    {error && <p role="alert">{error}</p>}
  </section>;
}

function dayNumber(start: string, d: string) {
  // Same local-noon date arithmetic as the core feature; independent of UTC clock.
  return Math.round((new Date(d + 'T12:00:00').getTime() - new Date(start + 'T12:00:00').getTime()) / 86400000) + 1;
}
