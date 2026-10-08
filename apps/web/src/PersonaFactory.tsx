import { useEffect, useMemo, useState } from 'react';
import PersonaShooting from './PersonaShooting';
import {
  attachShootingBrief,
  completePersonaShooting,
  mergePersonaIdeas,
  readPersonaIdeas,
  writePersonaIdeas,
  type PersonaIdea as Idea,
  type PersonaIdeaFormat,
} from './personaIdeaState';
import { readLocalToday } from './localRuntime';
import { normalizePersonaRecommendationPayload, selectActionablePersonaIdeas } from './persona-opportunity';
import './persona-factory-v2.css';
import { personaEdgeRequest } from './edgeRuntimeClient';
import { getRuntimeSessionStatus, loginRuntimeSession, type RuntimeSessionStatus } from './runtimeSession';

const HISTORY = 'lifeos:persona:idea-history:v2';

function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || '') ?? fallback;
  } catch {
    return fallback;
  }
}

function localDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function localIdeas(history: { title: string; status: string }[]): Idea[] {
  const blocked = new Set(
    history
      .filter((item) => ['used', 'rejected', 'later'].includes(item.status))
      .map((item) => item.title.toLowerCase()),
  );
  const seed: [string, string, PersonaIdeaFormat][] = [
    ['Что зритель не видит за минуту до спектакля', 'Закулисье через один конкретный момент', 'reel'],
    ['Что актёр понимает после очередного отказа', 'Личное наблюдение без наставничества и экспертной позы', 'reel'],
    ['Один день между театром и музыкой', 'Соединить две профессии одной историей', 'reel'],
    ['Что происходит после «стоп, снято»', 'Момент, который обычно вырезают', 'reel'],
  ];
  return seed
    .filter((item) => !blocked.has(item[0].toLowerCase()))
    .map((item, index) => ({
      id: `local-${index}`,
      title: item[0],
      angle: item[1],
      format: item[2],
      score: 62 - index,
      confidence: 42,
      reason: 'Резервная идея без свежей рыночной проверки.',
      whyNow: ['Свежая рыночная аналитика временно недоступна'],
      estimatedMinutes: 8,
      estimatedDurationSeconds: 22,
      soloPlan: 'Один разговорный дубль + два коротких B-roll.',
      status: 'candidate',
    }));
}

async function api(payload: Record<string, unknown>) {
  return personaEdgeRequest(payload);
}

function compactContext() {
  const now = new Date();
  const day = localDateKey(now);
  const today = readLocalToday(localStorage, day).map((item) => ({
    id: item.id,
    title: item.title,
    kind: item.kind,
    planned_start: item.planned_start,
    planned_end: item.planned_end,
    status: item.status,
  }));
  return {
    now: now.toISOString(),
    localDate: day,
    today,
    device: 'iphone',
    desiredMarkets: ['instagram', 'vk', 'youtube'],
    targetMarket: 'Russia / Moscow',
  };
}

export default function PersonaFactory() {
  const [history, setHistory] = useState<{ title: string; status: string }[]>(() => read(HISTORY, []));
  const [ideas, setIdeas] = useState<Idea[]>(() => mergePersonaIdeas(localIdeas(history), readPersonaIdeas(localStorage)));
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [approvedRun, setApprovedRun] = useState<{ historyKey: string; ideas: Idea[] } | null>(null);
  const [showBank, setShowBank] = useState(false);
  const [analysisState, setAnalysisState] = useState<'loading' | 'ready' | 'degraded'>('loading');
  const [analysisSummary, setAnalysisSummary] = useState('');
  const [authStatus, setAuthStatus] = useState<RuntimeSessionStatus | null>(null);
  const [passcode, setPasscode] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void getRuntimeSessionStatus()
      .then((status) => {
        if (!cancelled) setAuthStatus(status);
      })
      .catch(() => {
        if (!cancelled) {
          setAuthStatus({ configured: true, authenticated: false });
          setAuthError('Не удалось проверить подключение к Persona runtime.');
        }
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => localStorage.setItem(HISTORY, JSON.stringify(history)), [history]);
  useEffect(() => writePersonaIdeas(localStorage, ideas), [ideas]);

  useEffect(() => {
    setApprovedRun(null);
    setChosenId(null);
    setShowBank(false);
    if (!authStatus?.authenticated) return;
    let cancelled = false;
    setAnalysisState('loading');
    setAnalysisSummary('Persona анализирует сегодняшний контекст, свежие сигналы рынка и сама критикует варианты…');

    void api({
      action: 'recommend',
      history,
      priorIdeas: readPersonaIdeas(localStorage),
      seed: localIdeas(history),
      context: compactContext(),
    })
      .then((data) => {
        if (cancelled) return;
        const normalized = normalizePersonaRecommendationPayload(data);
        if (!normalized.recommendation) throw new Error('quality_bar_not_met');
        const planned = [normalized.recommendation, ...normalized.alternatives];
        setApprovedRun({ historyKey: JSON.stringify(history), ideas: planned });
        setIdeas((current) => mergePersonaIdeas(planned, current));
        setAnalysisSummary(normalized.analysisSummary || 'Рекомендация прошла внутреннюю критику.');
        setAnalysisState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setApprovedRun(null);
        setChosenId(null);
        setShowBank(false);
        setIdeas((current) => mergePersonaIdeas(localIdeas(history), current));
        setAnalysisSummary('Свежую рыночную аналитику сейчас получить не удалось. Показываю резерв без ложной уверенности.');
        setAnalysisState('degraded');
      });

    return () => {
      cancelled = true;
    };
  }, [history, authStatus?.authenticated]);

  // Persisted/fallback ideas are useful history, not an authorization to shoot.
  // The history fingerprint prevents one frame of stale actions before a new effect runs.
  const historyKey = JSON.stringify(history);
  const visible = analysisState === 'ready' && authStatus?.authenticated &&
    approvedRun?.historyKey === historyKey
    ? selectActionablePersonaIdeas(approvedRun.ideas, history)
    : [];
  const chosenApproval = chosenId ? visible.find((item) => item.id === chosenId) : null;
  const chosen = chosenApproval
    ? ideas.find((item) => item.id === chosenApproval.id && item.title === chosenApproval.title) ?? chosenApproval
    : null;

  function remember(idea: Idea, status: string) {
    setHistory((current) => [...current.filter((item) => item.title !== idea.title), { title: idea.title, status }]);
    setChosenId(null);
  }

  function saveBrief(idea: Idea, brief: NonNullable<Idea['shootingBrief']>) {
    setIdeas((current) => attachShootingBrief(current, idea.id, brief));
  }

  function saveResult(idea: Idea, result: { completedAt: string; shotIds: string[] }) {
    setIdeas((current) => completePersonaShooting(current, idea.id, result));
  }

  async function connectPersona() {
    if (authBusy || !passcode.trim()) return;
    setAuthBusy(true);
    setAuthError('');
    try {
      const next = await loginRuntimeSession(passcode);
      setAuthStatus(next);
      setPasscode('');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Не удалось подключить Persona runtime.');
    } finally {
      setAuthBusy(false);
    }
  }

  if (!authStatus) {
    return <section className="personaFactoryV2"><div className="status">Проверяю подключение Persona…</div></section>;
  }

  if (!authStatus.configured) {
    return <section className="personaFactoryV2"><div className="status">Persona runtime пока не настроен. Рекомендации не выдаются без рабочего backend.</div></section>;
  }

  if (!authStatus.authenticated) {
    return (
      <section className="personaFactoryV2">
        <header className="pfHead">
          <div>
            <small>PERSONA · SHOOT NOW</small>
            <h2>Подключить Persona</h2>
            <p>Для рыночной аналитики, внутренней критики и съёмочного задания нужен защищённый runtime-сеанс.</p>
          </div>
        </header>
        <div className="captureCard">
          <input
            type="password"
            autoComplete="current-password"
            value={passcode}
            onChange={(event) => setPasscode(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') void connectPersona(); }}
            placeholder="Код доступа"
          />
          <button className="primary" disabled={authBusy || !passcode.trim()} onClick={() => void connectPersona()}>
            {authBusy ? 'Подключаю…' : 'Подключить и проанализировать'}
          </button>
          {authError && <div className="status">{authError}</div>}
        </div>
      </section>
    );
  }

  if (chosen) {
    return (
      <section className="personaFactoryV2">
        <button className="ghost" onClick={() => setChosenId(null)}>← К рекомендации</button>
        <div className="captureCard">
          <small>{chosen.format.toUpperCase()} · confidence {Math.round(chosen.confidence ?? chosen.score)}%</small>
          <h3>{chosen.title}</h3>
          <p>{chosen.angle}</p>
          {chosen.hook && <div className="ideaReason"><b>Хук:</b> {chosen.hook}</div>}
          {chosen.script && <div className="ideaReason"><b>Текст:</b> {chosen.script}</div>}
          <div className="ideaReason">
            <b>Снять:</b> примерно {chosen.estimatedMinutes ?? 10} мин.
            {chosen.soloPlan ? <> <b>Одному:</b> {chosen.soloPlan}</> : null}
            {chosen.helperPlan ? <> <b>С помощником:</b> {chosen.helperPlan}</> : null}
          </div>
          <PersonaShooting
            idea={chosen}
            brief={chosen.shootingBrief ?? null}
            result={chosen.shootingResult ?? null}
            onBrief={(brief) => saveBrief(chosen, brief)}
            onResult={(result) => saveResult(chosen, result)}
          />
          <button className="dangerGhost" onClick={() => remember(chosen, 'rejected')}>Не берём</button>
        </div>
      </section>
    );
  }

  const top = visible[0];
  return (
    <section className="personaFactoryV2">
      <header className="pfHead">
        <div>
          <small>PERSONA · SHOOT NOW</small>
          <h2>Что снять сейчас</h2>
          <p>Одна рекомендация после анализа контекста, рынка и внутренней критики. Не публикуем ради графика.</p>
        </div>
      </header>

      <div className="status" role="status">
        {analysisState === 'loading' ? 'Анализирую…' : analysisState === 'ready' ? '✓ Анализ завершён' : '⚠ Аналитика ограничена'}
        {analysisSummary ? ` · ${analysisSummary}` : ''}
      </div>

      {top ? (
        <div className="todayIdea">
          <small>
            РЕШЕНИЕ РЕДАКЦИИ · {Math.round(top.confidence ?? top.score)}% confidence · ~{top.estimatedMinutes ?? 10} мин
          </small>
          <h3>{top.title}</h3>
          <p>{top.angle}</p>
          {top.reason && <div className="ideaReason">{top.reason}</div>}
          {top.whyNow?.length ? (
            <div className="ideaReason"><b>Почему сейчас:</b> {top.whyNow.join(' · ')}</div>
          ) : null}
          {top.qualityVerdict ? (
            <div className="ideaReason">
              <b>{top.qualityVerdict.verdict} · {top.qualityVerdict.score}/100</b> — {top.qualityVerdict.summary}
            </div>
          ) : null}
          {top.marketEvidence?.length ? (
            <div className="ideaReason">
              <b>Основание:</b> {top.marketEvidence.slice(0, 3).map((item) => item.finding).join(' · ')}
            </div>
          ) : null}
          <div className="actions">
            <button className="primary" disabled={analysisState === 'loading'} onClick={() => setChosenId(top.id)}>Берём — открыть съёмку</button>
            <button className="ghost" onClick={() => setShowBank(!showBank)}>
              {showBank ? 'Скрыть альтернативу' : 'Другой вариант'}
            </button>
          </div>
        </div>
      ) : (
        <div className="status">Сейчас нет идеи, которая проходит минимальный quality bar. Система не будет предлагать слабый материал ради регулярности.</div>
      )}

      {analysisState === 'ready' && showBank && visible.slice(1, 2).map((idea) => (
        <div className="ideaBank" key={idea.id}>
          <article className="ideaRow">
            <button className="ideaSelect" onClick={() => setChosenId(idea.id)}>
              <small>АЛЬТЕРНАТИВА · {idea.format.toUpperCase()} · {Math.round(idea.confidence ?? idea.score)}%</small>
              <strong>{idea.title}</strong>
              <span>{idea.angle}</span>
            </button>
            <button className="later" onClick={() => remember(idea, 'later')}>На потом</button>
            <button className="reject" onClick={() => remember(idea, 'rejected')}>Неинтересно</button>
          </article>
        </div>
      ))}
    </section>
  );
}
