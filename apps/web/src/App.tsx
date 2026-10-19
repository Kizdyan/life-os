import { useEffect, useMemo, useState } from 'react';
import { allItems, applyPlan, backendMode, move, outcome, pendingMoveUndo, today, undoMove } from './api';
import { cacheToday, cachedToday, flush } from './offline';
import { enqueueOutcome } from './outbox';
import { createQuickCapture } from './quickCapture';
import ErikaSheet from './ErikaSheet';
import type { Item } from './types';
import './app.css';

type Tab = 'today' | 'tasks' | 'calendar' | 'more';
type TaskFilter = 'all' | 'planned' | 'done';
type IconName = 'sun' | 'tasks' | 'calendar' | 'more' | 'plus' | 'sparkle' | 'arrow' | 'check' | 'clock' | 'chevronLeft' | 'chevronRight' | 'photo' | 'chart' | 'close' | 'edit' | 'cloud';

function Icon({ name, size = 21 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'sun' && <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></>}
    {name === 'tasks' && <><path d="M9 6h12M9 12h12M9 18h12"/><path d="m3 6 1.5 1.5L7 4.5M3 12l1.5 1.5L7 10.5M3 18l1.5 1.5L7 16.5"/></>}
    {name === 'calendar' && <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/></>}
    {name === 'more' && <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>}
    {name === 'plus' && <path d="M12 5v14M5 12h14"/>}
    {name === 'sparkle' && <><path d="m12 2 2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2L12 2Z"/></>}
    {name === 'arrow' && <path d="M7 17 17 7M7 7h10v10"/>}
    {name === 'check' && <path d="m4 12 5 5L20 6"/>}
    {name === 'clock' && <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>}
    {name === 'chevronLeft' && <path d="m14.5 5-7 7 7 7"/>}
    {name === 'chevronRight' && <path d="m9.5 5 7 7-7 7"/>}
    {name === 'photo' && <><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 16-5-5L5 21"/></>}
    {name === 'chart' && <><path d="M4 20V10m6 10V4m6 16v-7m4 7v-12"/></>}
    {name === 'close' && <path d="M5 5 19 19M19 5 5 19"/>}
    {name === 'edit' && <><path d="M4 20h4l11-11a2 2 0 0 0-4-4L4 16v4Z"/><path d="m13 7 4 4"/></>}
    {name === 'cloud' && <><path d="M8 19H6a4 4 0 0 1-.3-8A7 7 0 0 1 19 10a4.5 4.5 0 0 1-1 9h-3"/><path d="M12 14v7m-3-3 3 3 3-3"/></>}
  </svg>;
}

function localIso(d = new Date()): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function fromIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}
function addDays(iso: string, n: number): string {
  const d = fromIso(iso); d.setDate(d.getDate() + n); return localIso(d);
}
function prettyDate(iso: string, options: Intl.DateTimeFormatOptions): string {
  return fromIso(iso).toLocaleDateString('ru-RU', options);
}
function monthCells(month: string): string[] {
  const [year, mon] = month.split('-').map(Number);
  const first = new Date(year, mon - 1, 1, 12);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, mon - 1, 1 - offset, 12);
  return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return localIso(d); });
}
function shortTime(item: Item) { return item.planned_start?.slice(11, 16) || '—'; }
function isDone(item: Item) { return item.status === 'completed'; }
function future(item: Item) { return item.status === 'planned'; }
function taskDate(item: Item) { return item.planned_start?.slice(0, 10); }
function weekdayWeek(iso: string): string[] {
  const d = fromIso(iso);
  const start = addDays(iso, -((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export default function App() {
  const todayDate = localIso();
  const [todayItems, setTodayItems] = useState<Item[]>(() => cachedToday(todayDate));
  const [all, setAll] = useState<Item[]>([]);
  const [tab, setTab] = useState<Tab>('today');
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all');
  const [chosenDate, setChosenDate] = useState(todayDate);
  const [month, setMonth] = useState(todayDate.slice(0, 7));
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(!navigator.onLine);
  const [erikaOpen, setErikaOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickDate, setQuickDate] = useState(todayDate);
  const [quickTime, setQuickTime] = useState('09:00');
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickMessage, setQuickMessage] = useState('');
  const [moving, setMoving] = useState<Item | null>(null);
  const [moveAt, setMoveAt] = useState('');
  const [canUndo, setCanUndo] = useState(() => backendMode === 'local' && Boolean(pendingMoveUndo()));

  async function load() {
    try {
      const fresh = await today(todayDate);
      setTodayItems(fresh);
      cacheToday(todayDate, fresh);
      if (backendMode === 'local') setAll(await allItems());
      setCanUndo(backendMode === 'local' && Boolean(pendingMoveUndo()));
      setError('');
      await flush(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить расписание.');
    }
  }
  useEffect(() => {
    void load();
    const online = () => { setOffline(false); void load(); };
    const off = () => setOffline(true);
    addEventListener('online', online); addEventListener('offline', off);
    return () => { removeEventListener('online', online); removeEventListener('offline', off); };
  }, []);

  const items = backendMode === 'local' ? all : todayItems;
  const todayList = items.filter(item => taskDate(item) === todayDate);
  const chosenList = items.filter(item => taskDate(item) === chosenDate);
  const countDone = todayList.filter(isDone).length;
  const countPending = todayList.filter(future).length;
  const percentage = todayList.length ? Math.round(countDone / todayList.length * 100) : 0;
  const nextTask = todayList.filter(item => future(item) && item.planned_start && new Date(item.planned_start).getTime() > Date.now())[0];
  const weekDates = weekdayWeek(todayDate);
  const countByDate = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items) { const d = taskDate(item); if (d) counts[d] = (counts[d] || 0) + 1; }
    return counts;
  }, [items]);
  const taskList = items.filter(item => taskFilter === 'all' || (taskFilter === 'done' ? isDone(item) : future(item)));
  const calendarCells = monthCells(month);

  function openQuick(forDate = todayDate) {
    setQuickDate(forDate); setQuickTime('09:00'); setQuickTitle(''); setQuickMessage(''); setQuickOpen(true);
  }
  async function saveQuick() {
    if (quickBusy) return;
    setQuickBusy(true); setQuickMessage('');
    try {
      const request = createQuickCapture({ title: quickTitle, date: quickDate, time: quickTime });
      const result = await applyPlan(request.idempotencyKey, request.items);
      const stored = await today(quickDate);
      if (!result.ids.length || !result.ids.every(id => stored.some(item => item.id === id && item.title === request.items[0].title && item.planned_start === request.items[0].planned_start)))
        throw new Error('Не удалось подтвердить сохранение задачи.');
      await load();
      setChosenDate(quickDate); setMonth(quickDate.slice(0, 7));
      setTab(quickDate === todayDate ? 'today' : 'calendar');
      setQuickOpen(false);
      setQuickTitle('');
      setQuickMessage(result.replayed ? 'Задача уже существует — дубликат не создан.' : '');
    } catch (e) {
      setQuickMessage(e instanceof Error ? e.message : 'Не удалось создать задачу.');
    } finally { setQuickBusy(false); }
  }
  async function mark(item: Item, command: 'complete' | 'not_complete') {
    try {
      await outcome(item, command); await load();
    } catch (e) {
      if (!navigator.onLine) { enqueueOutcome({ itemId: item.id, command, createdAt: new Date().toISOString() }); setOffline(true); }
      else setError(e instanceof Error ? e.message : 'Действие не выполнено.');
    }
  }
  async function saveMove() {
    if (!moving || !moveAt) return;
    try {
      const d = new Date(moveAt);
      if (!Number.isFinite(d.getTime())) throw new Error('Проверьте дату и время.');
      await move(moving.id, d.toISOString());
      setMoving(null); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось перенести задачу.'); }
  }
  async function restoreMove() {
    try {
      const undo = pendingMoveUndo();
      if (!undo) return;
      await undoMove(undo); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Отмена не выполнена.'); }
  }
  function showMove(item: Item) {
    setMoving(item); setMoveAt(item.planned_start?.slice(0, 16) || '');
  }
  function chooseDay(iso: string) {
    setChosenDate(iso); setMonth(iso.slice(0, 7)); setTab('calendar');
  }
  function monthDelta(n: number) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1, 12);
    setMonth(localIso(d).slice(0, 7));
  }

  function TaskRows({ list }: { list: Item[] }) {
    if (!list.length) return null;
    return <div className="taskList">
      {list.map(item => <div className={'taskRow' + (isDone(item) ? ' isDone' : '')} key={item.id}>
        <button className="taskCheck" type="button" disabled={isDone(item)} title="Отметить выполнение" aria-label={'Выполнить: ' + item.title} onClick={() => void mark(item, 'complete')}>
          {isDone(item) ? <Icon name="check" size={17}/> : null}
        </button>
        <div className="taskBody">
          <strong>{item.title}</strong>
          <span>{tab === 'tasks' ? prettyDate(taskDate(item) || todayDate, { day: 'numeric', month: 'short' }) + ' · ' : ''}{shortTime(item)} · {item.status === 'completed' ? 'Выполнено' : item.status === 'planned' ? 'Запланировано' : 'Не выполнено'}</span>
        </div>
        <button className="taskMove" type="button" aria-label={'Перенести: ' + item.title} onClick={() => showMove(item)}><Icon name="edit" size={19}/></button>
        {item.status === 'planned' && <button className="taskSkip" type="button" aria-label={'Не выполнено: ' + item.title} onClick={() => void mark(item, 'not_complete')}>···</button>}
      </div>)}
    </div>;
  }

  return <main className="lifeApp">
    <div className="lifeFrame">
      <header className="topBar">
        <div className="brandMark"><span className="brandGlyph">L.</span><span>LIFE OS</span></div>
        <button className="assistantPill" type="button" onClick={() => setErikaOpen(true)}><Icon name="sparkle" size={16}/> Эрика</button>
      </header>
      <div className="pageHeader">
        <div>
          <p className="eyebrow">{prettyDate(todayDate, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1>{tab === 'today' ? 'Мой день' : tab === 'tasks' ? 'Все задачи' : tab === 'calendar' ? 'Календарь' : 'Пространство'}</h1>
          <p className="pageSubtitle">{tab === 'today' ? 'Спокойный ритм. Ясный план.' : tab === 'tasks' ? 'Всё важное — в одном месте.' : tab === 'calendar' ? 'Планы в масштабе месяца.' : 'Инструменты для других направлений.'}</p>
        </div>
      </div>
      {error && <div className="lifeAlert" role="alert">{error}<button onClick={() => {setError('');void load();}}>Повторить</button></div>}

      {tab === 'today' && <>
        <section className="overviewCard" aria-label="Сводка дня">
          <div className="overviewCopy">
            <span className="overline">МОЙ РИТМ</span>
            <h2>{todayList.length === 0 ? 'День открыт для планов' : countPending > 0 ? 'Сегодня есть что сделать' : 'Все планы под контролем'}</h2>
            <p>{todayList.length === 0 ? 'Добавьте первое дело — остальное соберём по шагам.' : countPending === 0 ? 'Хорошая работа. Можно немного выдохнуть.' : countPending + ' ' + (countPending === 1 ? 'дело ждёт' : 'дела ждут') + ' вашего внимания.'}</p>
            <button className="overviewAction" type="button" onClick={() => openQuick()}><Icon name="plus" size={18}/> Новая задача</button>
          </div>
          <div className="progressRing" style={{ background: 'conic-gradient(#c6d6a7 ' + percentage + '%,rgba(255,255,255,.13) 0)' }} aria-label={'Выполнено ' + percentage + ' процентов'}>
            <div><strong>{percentage}%</strong><small>готово</small></div>
          </div>
        </section>
        <section className="weekStripSection" aria-label="Ближайшая неделя">
          <div className="sectionHead"><h2>Неделя</h2><button type="button" onClick={() => {setTab('calendar');setMonth(todayDate.slice(0,7));}}>Весь месяц <Icon name="arrow" size={16}/></button></div>
          <div className="weekStrip">{weekDates.map(iso => <button type="button" key={iso} className={'weekDay ' + (iso === todayDate ? 'chosen' : '')} onClick={() => chooseDay(iso)}>
            <span>{prettyDate(iso, { weekday: 'short' }).replace('.', '')}</span><strong>{Number(iso.slice(8))}</strong><i className={countByDate[iso] ? 'hasTasks' : ''}/>
          </button>)}</div>
        </section>
        <section className="scheduleSection">
          <div className="sectionHead"><h2>План на сегодня</h2><span className="quietCount">{todayList.length} запланировано</span></div>
          {todayList.length ? <TaskRows list={todayList}/> : <div className="emptyPanel">
            <div className="emptySymbol"><Icon name="sun" size={26}/></div>
            <strong>Пока никаких дел</strong><p>Начните с одной задачи. Можно добавить её вручную или попросить Эрику.</p>
            <button type="button" onClick={() => openQuick()}>+ Добавить задачу</button>
          </div>}
        </section>
        {nextTask && <p className="smallTip"><Icon name="clock" size={16}/> Следующее дело: {nextTask.title}, {shortTime(nextTask)}</p>}
      </>}

      {tab === 'tasks' && <>
        <div className="taskToolbar"><div className="filterGroup" role="group" aria-label="Фильтр задач">
          <button className={taskFilter === 'all' ? 'selected' : ''} onClick={() => setTaskFilter('all')}>Все</button>
          <button className={taskFilter === 'planned' ? 'selected' : ''} onClick={() => setTaskFilter('planned')}>В планах</button>
          <button className={taskFilter === 'done' ? 'selected' : ''} onClick={() => setTaskFilter('done')}>Готово</button>
        </div><button className="smallAdd" onClick={() => openQuick()} aria-label="Новая задача"><Icon name="plus"/></button></div>
        {taskList.length ? <TaskRows list={taskList}/> : <div className="emptyPanel"><div className="emptySymbol"><Icon name="tasks" size={26}/></div><strong>{items.length ? 'Здесь пока пусто' : 'Список ждёт первого дела'}</strong><p>Добавьте задачу на сегодня или на другую дату. Она появится и в календаре.</p><button onClick={() => openQuick()}>+ Новая задача</button></div>}
      </>}

      {tab === 'calendar' && <>
        <section className="monthCard">
          <div className="monthTop"><h2>{prettyDate(month + '-01', { month:'long', year:'numeric' })}</h2><div className="monthArrows"><button aria-label="Предыдущий месяц" onClick={() => monthDelta(-1)}><Icon name="chevronLeft"/></button><button aria-label="Следующий месяц" onClick={() => monthDelta(1)}><Icon name="chevronRight"/></button></div></div>
          <div className="monthGrid" aria-label="Дни месяца">
            {['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(x => <span key={x} className="weekLabel">{x}</span>)}
            {calendarCells.map(iso => <button key={iso} onClick={() => chooseDay(iso)} aria-label={prettyDate(iso, {day:'numeric',month:'long',year:'numeric'}) + (countByDate[iso] ? ', задач: ' + countByDate[iso] : '')} className={'monthDay' + (iso.slice(0,7) !== month ? ' otherMonth' : '') + (iso === chosenDate ? ' selected' : '') + (iso === todayDate ? ' isToday' : '')}>
              <span>{Number(iso.slice(8))}</span><i className={countByDate[iso] ? 'hasTasks' : ''}/>
            </button>)}
          </div>
        </section>
        <section className="scheduleSection"><div className="sectionHead"><h2>{prettyDate(chosenDate, {day:'numeric',month:'long'})}</h2><button onClick={() => openQuick(chosenDate)}><Icon name="plus" size={17}/> Добавить</button></div>
          {chosenList.length ? <TaskRows list={chosenList}/> : <div className="calendarEmpty">На этот день пока нет задач.<button type="button" onClick={() => openQuick(chosenDate)}>Запланировать</button></div>}
        </section>
      </>}

      {tab === 'more' && <section className="productHub">
        <p className="hubIntro">Ваш ежедневник отдельно, творческие инструменты — отдельно. Всё под рукой, ничто не мешает планировать.</p>
        <a href="#persona-photo" className="hubCard"><span className="hubIcon"><Icon name="photo" size={24}/></span><div><strong>Persona Photo</strong><small>Обработка фотографий</small></div><Icon name="chevronRight"/></a>
        <a href="#divem" className="hubCard"><span className="hubIcon"><Icon name="chart" size={24}/></span><div><strong>DiveM</strong><small>Диагностика медийного профиля</small></div><Icon name="chevronRight"/></a>
        <div className="storagePanel"><Icon name="cloud"/><div><strong>Хранение на этом устройстве</strong><p>Сейчас задачи сохраняются только в этом браузере. Синхронизация между устройствами ещё не подключена.</p></div></div>
      </section>}

      <p className="storageLine">{offline ? 'Нет сети · ' : ''}{backendMode === 'local' ? 'Данные пока только в этом браузере' : 'Подключён серверный режим'}</p>
    </div>

    <nav className="lifeDock" aria-label="Основные разделы">
      {([['today','sun','Сегодня'],['tasks','tasks','Задачи'],['calendar','calendar','Календарь'],['more','more','Ещё']] as const).map(([id, icon, label]) => <button type="button" key={id} aria-current={tab === id ? 'page' : undefined} className={tab === id ? 'active' : ''} onClick={() => { setTab(id); if(id === 'today') void load(); }}>
        <Icon name={icon} size={22}/><span>{label}</span>
      </button>)}
    </nav>
    <button className="floatingAdd" type="button" aria-label="Быстро добавить задачу" onClick={() => openQuick(tab === 'calendar' ? chosenDate : todayDate)}><Icon name="plus" size={26}/></button>

    {canUndo && <div className="lifeToast" role="status"><span>Перенос сохранён</span><button onClick={() => void restoreMove()}>Отменить</button></div>}
    {moving && <div className="lifeBackdrop" onClick={() => setMoving(null)}><div className="lifeSheet" role="dialog" aria-modal="true" aria-label="Перенести задачу" onClick={e => e.stopPropagation()}>
      <div className="sheetTitle"><div><span className="overline">РАСПИСАНИЕ</span><h2>Перенести дело</h2></div><button aria-label="Закрыть" onClick={() => setMoving(null)}><Icon name="close"/></button></div>
      <p className="sheetContext">{moving.title}</p><label>Дата и время<input type="datetime-local" aria-label="Новая дата и время" value={moveAt} onChange={e => setMoveAt(e.target.value)}/></label>
      <button className="sheetSubmit" onClick={() => void saveMove()}>Сохранить перенос</button>
    </div></div>}
    {quickOpen && <div className="lifeBackdrop" onClick={() => setQuickOpen(false)}><form className="lifeSheet" role="dialog" aria-modal="true" aria-label="Новая задача" onClick={e => e.stopPropagation()} onSubmit={e => {e.preventDefault();void saveQuick();}}>
      <div className="sheetTitle"><div><span className="overline">БЫСТРОЕ ДОБАВЛЕНИЕ</span><h2>Новая задача</h2></div><button type="button" aria-label="Закрыть" onClick={() => setQuickOpen(false)}><Icon name="close"/></button></div>
      <label>Что нужно сделать?<input autoFocus value={quickTitle} placeholder="Например, репетиция вокала" onChange={e => setQuickTitle(e.target.value)}/></label>
      <div className="sheetFields"><label>Дата<input type="date" value={quickDate} onChange={e => setQuickDate(e.target.value)}/></label><label>Время<input type="time" value={quickTime} onChange={e => setQuickTime(e.target.value)}/></label></div>
      {quickMessage && <p className="formError" role="alert">{quickMessage}</p>}
      <button className="sheetSubmit" type="submit" disabled={quickBusy}>{quickBusy ? 'Сохраняю…' : 'Добавить в расписание'}</button>
    </form></div>}
    {erikaOpen && <ErikaSheet items={todayItems} onClose={() => setErikaOpen(false)} onApplied={() => void load()}/>}
  </main>;
}
