import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
    CalendarDays,
    CircleDashed,
    Clock3,
    MessageCircle,
    ListTodo,
    Mic,
    Plus,
    RefreshCw,
    RotateCcw,
    Search,
    Sparkles,
    UserRound,
} from 'lucide-react';
import './lifeos.css';
import './styles/lifeos-v2.css';
import './styles/lifeos-v3.css';
import './styles/lifeos-v4.css';
import './styles/lifeos-components.css';
import type { Screen } from './domain/lifeos';
import AnalyticsScreen from './features/analytics/AnalyticsScreen';
import CalendarScreen from './features/calendar/CalendarScreen';
import DispatcherSheet from './features/dispatcher/DispatcherSheet';
import ErikaWakeListener from './features/dispatcher/ErikaWakeListener';
import IntegrationHub from './features/integrations/IntegrationHub';
import { GoalsView, ProjectsView } from './features/release1/GoalsProjects';
import GlobalSearch from './features/search/GlobalSearch';
import { EventEditor as ModularEventEditor, HabitManager as ModularHabitManager, MoreScreen, QuickCreateSheet as ModularQuickCreateSheet } from './features/shell/ShellPanels';
import TaskEditor from './features/tasks/TaskEditor';
import TasksScreen from './features/tasks/TasksScreen';
import TodayScreen from './features/today/TodayScreen';
import WeekScreen from './features/week/WeekScreen';
import { useLifeOSController } from './hooks/useLifeOSController';

export default function LifeOS() {
    const controller = useLifeOSController();
    const [searchOpen, setSearchOpen] = useState(false);
    const [dispatcherOpen, setDispatcherOpen] = useState(false);
    const [erikaAutoStart, setErikaAutoStart] = useState(false);
    const [captureText, setCaptureText] = useState(() => new URLSearchParams(window.location.search).get('capture') || '');
    const {
        screen,
        setScreen,
        data,
        user,
        loading,
        syncing,
        message,
        health,
        healthDetail,
        demo,
        editTask,
        setEditTask,
        editEvent,
        setEditEvent,
        creating,
        setCreating,
        newTaskParentId,
        setNewTaskParentId,
        creatingEvent,
        setCreatingEvent,
        createMenu,
        setCreateMenu,
        habitManager,
        setHabitManager,
        calendarReturn,
        setCalendarReturn,
        undoAction,
        displayName,
        loadRemote,
        login,
        openDemo,
        logout,
        refresh,
        patchTask,
        bulkPatchTasks,
        reorderSubtasks,
        undoLast,
        addTask,
        recordTimeEntry,
        loadTimeEntries,
        updateTimeEntry,
        deleteTimeEntry,
        addEvent,
        addHabit,
        patchHabit,
        patchEvent,
        trashEvent,
        restoreEvent,
        toggleHabit,
        saveDailyCheckin,
        dispatchDay,
        addTaskDependency,
        removeTaskDependency,
        permanentDeleteTask,
        resolveSyncConflict,
    } = controller;

    useEffect(() => {
        if (!data || !captureText || creating) return;
        setNewTaskParentId('');
        setCreating(true);
        window.history.replaceState({}, '', window.location.pathname);
    }, [data, captureText, creating, setCreating, setNewTaskParentId]);

    const firstName = useMemo(() => displayName.trim().split(/\s+/)[0] || 'Костя', [displayName]);
    const greeting = useMemo(() => {
        const hour = new Date().getHours();
        if (hour < 6) return 'Доброй ночи';
        if (hour < 12) return 'Доброе утро';
        if (hour < 18) return 'Добрый день';
        return 'Добрый вечер';
    }, []);
    const openErika = () => { setErikaAutoStart(false); setDispatcherOpen(true); };

    if (loading) return <div className='splash'><div className='brand'>L</div><b>Life OS</b><span>Загружаю систему…</span></div>;
    if (!user) return <Login health={health} healthDetail={healthDetail} message={message} login={login} demo={openDemo} />;
    if (!data) return <Login health={health} healthDetail={healthDetail} message={message || 'Нет данных'} login={login} demo={openDemo} />;

    return (
        <div className='shell'>
            <header className='top'>
                <div>
                    <span className='eyebrow'>LIFE OS</span>
                    <h1>{title(screen)}</h1>
                </div>
                <div className='topActions'>
                    <button onClick={() => setDispatcherOpen(true)} aria-label='Открыть голосовой диспетчер'><Mic size={18}/></button>
                    <button onClick={() => setSearchOpen(true)} aria-label='Глобальный поиск'><Search size={18}/></button>
                    <button onClick={refresh} className={syncing ? 'spin' : ''} aria-label='Обновить данные'><RefreshCw size={18} /></button>
                    <button className='avatar' onClick={() => setScreen('more')} aria-label='Открыть меню'>{demo ? 'D' : displayName[0] || 'K'}</button>
                </div>
            </header>
            {(message || syncing || demo) && <div className='syncLine'><i className={message ? 'bad' : 'good'} />{demo ? 'Демо • изменения локальные' : syncing ? 'Синхронизация…' : message}</div>}
            {screen === 'today' && <section className='erikaHome' aria-label='Эрика — голосовой помощник'>
                <div className='erikaGreeting'><span>{greeting}, {firstName}</span><h2>Чем могу помочь?</h2></div>
                <button className='erikaOrb' onClick={openErika} aria-label='Поговорить с Эрикой'><span className='erikaOrbGlow'/><Mic size={30}/></button>
                <button className='erikaPrompt' onClick={openErika}><MessageCircle size={18}/><span><b>Спросить Эрику</b><small>Говори свободно — задачи, график, планы и вопросы</small></span><Mic size={18}/></button>
                <div className='erikaSuggestions'>
                    <button onClick={openErika}>Что у меня сегодня?</button><button onClick={openErika}>Перестрой мой день</button><button onClick={() => setScreen('progress')}>Как идёт моя неделя?</button>
                </div>
            </section>}
            <main className={screen === 'today' ? 'mainWithErika' : ''}>
                {screen === 'today' && <TodayScreen data={data} status={patchTask} toggleHabit={toggleHabit} saveDailyCheckin={saveDailyCheckin} dispatchDay={dispatchDay} editTask={setEditTask} editEvent={setEditEvent} openCalendar={() => { setCalendarReturn('today'); setScreen('calendar'); }} />}
                {screen === 'week' && <WeekScreen data={data} editTask={setEditTask} editEvent={setEditEvent} status={patchTask} bulkStatus={bulkPatchTasks} />}
                {screen === 'tasks' && <TasksScreen data={data} edit={setEditTask} status={patchTask} bulkStatus={bulkPatchTasks} />}
                {screen === 'progress' && <AnalyticsScreen data={data} />}
                {screen === 'more' && <MoreScreen goCalendar={() => { setCalendarReturn('more'); setScreen('calendar'); }} goGoals={() => setScreen('goals')} goProjects={() => setScreen('projects')} goIntegrations={() => setScreen('integrations')} manageHabits={() => setHabitManager(true)} refresh={refresh} logout={logout} message={message} demo={demo} name={displayName} email={user.email} plannerSettings={data.plannerSettings} reload={() => loadRemote(true)} resolveConflict={resolveSyncConflict} />}
                {screen === 'integrations' && <IntegrationHub demo={demo} addTask={addTask} reload={loadRemote} />}
                {screen === 'goals' && <GoalsView goals={data.goals || []} projects={data.projects || []} tasks={data.tasks} dependencies={data.dependencies || []} reload={() => loadRemote()} />}
                {screen === 'projects' && <ProjectsView goals={data.goals || []} projects={data.projects || []} tasks={data.tasks} dependencies={data.dependencies || []} reload={() => loadRemote()} />}
                {screen === 'calendar' && <CalendarScreen data={data} editTask={setEditTask} editEvent={setEditEvent} status={patchTask} back={() => setScreen(calendarReturn)} />}
            </main>
            <ErikaWakeListener disabled={demo || dispatcherOpen} onWake={() => { setErikaAutoStart(true); setDispatcherOpen(true); }} />
            <button className='globalAdd' onClick={() => setCreateMenu(true)} aria-label='Добавить'><Plus size={25}/></button>
            <nav className='nav'>
                <Nav active={screen === 'today'} icon={<Clock3 />} text='Сегодня' click={() => setScreen('today')} />
                <Nav active={screen === 'week'} icon={<CalendarDays />} text='Неделя' click={() => setScreen('week')} />
                <Nav active={screen === 'tasks'} icon={<ListTodo />} text='Задачи' click={() => setScreen('tasks')} />
                <Nav active={screen === 'progress'} icon={<Sparkles />} text='Аналитика' click={() => setScreen('progress')} />
                <Nav active={screen === 'more' || screen === 'calendar' || screen === 'goals' || screen === 'projects' || screen === 'integrations'} icon={<CircleDashed />} text='Ещё' click={() => setScreen('more')} />
            </nav>
            {editTask && <TaskEditor key={editTask.id} task={editTask} projects={data.projects || []} tasks={data.tasks} history={data.history || []} demo={demo} recordTimeEntry={recordTimeEntry} loadTimeEntries={loadTimeEntries} updateTimeEntry={updateTimeEntry} deleteTimeEntry={deleteTimeEntry} dependencies={(data.dependencies || []).filter((item) => item.task_id === editTask.id && item.active)} close={() => setEditTask(null)} save={async (patch) => { const ok = await patchTask(editTask, patch); if (ok) setEditTask(null); return ok; }} addDependency={(dependsOnTaskId) => addTaskDependency(editTask.id, dependsOnTaskId)} removeDependency={removeTaskDependency} permanentDelete={() => permanentDeleteTask(editTask)} createSubtask={(parent) => { setEditTask(null); setNewTaskParentId(parent.id); setCreating(true); }} editRelatedTask={setEditTask} reorderSubtasks={reorderSubtasks} />}
            {creating && <TaskEditor task={null} initialTitle={captureText} parentTask={data.tasks.find((item) => item.id === newTaskParentId)} projects={data.projects || []} tasks={data.tasks} history={data.history || []} demo={demo} dependencies={[]} close={() => { setCreating(false); setNewTaskParentId(''); setCaptureText(''); }} save={async (patch) => { const ok = await addTask(patch); if (ok) { setNewTaskParentId(''); setCaptureText(''); } return ok; }} />}
            {editEvent && <ModularEventEditor event={editEvent} demo={demo} plannerSettings={data.plannerSettings} close={() => setEditEvent(null)} save={async (patch) => { const ok = await patchEvent(editEvent, patch); if (ok) setEditEvent(null); return ok; }} trash={async () => { const ok = await trashEvent(editEvent); if (ok) setEditEvent(null); return ok; }} restore={async () => { const ok = await restoreEvent(editEvent); if (ok) setEditEvent(null); return ok; }} />}
            {creatingEvent && <ModularEventEditor event={null} demo={demo} plannerSettings={data.plannerSettings} close={() => setCreatingEvent(false)} save={addEvent} />}
            {createMenu && <ModularQuickCreateSheet close={() => setCreateMenu(false)} task={() => { setCreateMenu(false); setNewTaskParentId(''); setCreating(true); }} event={() => { setCreateMenu(false); setCreatingEvent(true); }} />}
            {dispatcherOpen && <DispatcherSheet autoStart={erikaAutoStart} close={() => { setDispatcherOpen(false); setErikaAutoStart(false); }} reload={() => loadRemote(true)} demo={demo} />}
            {habitManager && <ModularHabitManager data={data} close={() => setHabitManager(false)} create={addHabit} update={patchHabit} />}
            {searchOpen && <GlobalSearch data={data} close={() => setSearchOpen(false)} openTask={setEditTask} openEvent={setEditEvent} goGoals={() => setScreen('goals')} goProjects={() => setScreen('projects')}/>} 
            {undoAction && <div className='undoToast' role='status'><span>{undoAction.label}</span><button onClick={undoLast}><RotateCcw size={15}/>Отменить</button></div>}
        </div>
    );
}

function Login({ health, healthDetail, message, login, demo }: { health: 'checking' | 'ok' | 'error'; healthDetail: string; message: string; login: () => void; demo: () => void }) {
    return (
        <div className='loginPage'>
            <div className='loginCard'>
                <div className='brand big'>L</div>
                <span className='eyebrow'>ПЕРСОНАЛЬНАЯ СИСТЕМА</span>
                <h1>Life OS</h1>
                <p>График, задачи, театр, проекты, привычки и прогресс — в одном месте.</p>
                <div className='health'><i className={health === 'ok' ? 'good' : health === 'error' ? 'bad' : ''} />{health === 'ok' ? 'Google Sheets подключён' : health === 'error' ? 'Нет связи с базой' : 'Проверяю базу…'}</div>
                {health === 'error' && healthDetail && <div className='error'>Диагностика: {healthDetail}</div>}
                {message && <div className='error'>{message}</div>}
                <button className='primary' onClick={login}><UserRound size={18} />Войти через Google</button>
                <button className='secondary' onClick={demo}>Посмотреть демо-интерфейс</button>
                <small>Личные данные доступны только владельцу.</small>
            </div>
        </div>
    );
}

function title(screen: Screen) {
    return { today: 'Сегодня', week: 'Неделя', tasks: 'Задачи', progress: 'Аналитика', more: 'Ещё', calendar: 'Календарь', goals: 'Цели', projects: 'Проекты', integrations: 'Интеграции' }[screen];
}

function Nav({ active, icon, text, click }: { active: boolean; icon: ReactNode; text: string; click: () => void }) {
    return <button className={active ? 'active' : ''} onClick={click}>{icon}<span>{text}</span></button>;
}
