import { useState } from 'react';
import { addHeroExercise, heroIdentityPayload, HERO_IDENTITY_RECORD_ID, readHeroIdentity, saveHeroIdentity, type HeroModeId } from './heroIdentity';
import { queueMutation, syncLocalReplica } from './runtimeSync';
import { createRuntimeGateway } from './runtimeTransport';
import { applyRemoteRuntimeRecords } from './localRuntime';
import './hero-identity.css';

const modes: { id: HeroModeId; label: string }[] = [
  { id: 'gentleman', label: 'Современный джентльмен' },
  { id: 'urban_charmer', label: 'Остроумный авантюрист' },
  { id: 'quiet_romantic', label: 'Романтический герой' },
  { id: 'dark_presence', label: 'Тёмный герой' },
  { id: 'raw_realist', label: 'Характерный реалист' },
];
export default function HeroIdentityPanel() {
  const [profile, setProfile] = useState(() => readHeroIdentity(localStorage));
  const [mode, setMode] = useState<HeroModeId>('gentleman');
  const [naturalness, setNaturalness] = useState(5);
  const [confidence, setConfidence] = useState(5);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  async function record() {
    if (busy) return;
    setBusy(true);
    const time = new Date().toISOString();
    const next = addHeroExercise(profile, {
      id: crypto.randomUUID(), createdAt: time, mode, naturalness, confidence,
      note: note.trim(), evidenceLevel: 'self_report',
    });
    const saved = { ...next, updatedAt: time };
    saveHeroIdentity(localStorage, saved);
    setProfile(saved);
    setNote('');
    if (import.meta.env.VITE_LIFE_OS_REMOTE_ENABLED !== 'true') {
      setStatus('Запись сохранена на этом устройстве. Удалённая синхронизация выключена.');
      setBusy(false);
      return;
    }
    queueMutation(localStorage, {
      mutationId: crypto.randomUUID(), userId: 'self',
      recordId: HERO_IDENTITY_RECORD_ID, kind: 'memory',
      expectedVersion: profile.version ?? null,
      payload: heroIdentityPayload(saved),
      deleted: false, clientUpdatedAt: time,
    });
    try {
      const result = await syncLocalReplica(localStorage,
        createRuntimeGateway({
          edgeUrl: import.meta.env.VITE_LIFE_OS_EDGE_RUNTIME_URL ?? '',
          apiUrl: import.meta.env.VITE_LIFE_OS_API_URL ?? '',
          storage: localStorage,
        }), rows => applyRemoteRuntimeRecords(localStorage, rows));
      setProfile(readHeroIdentity(localStorage));
      setStatus(result.conflicts.length
        ? 'Запись сохранена локально, но есть конфликт синхронизации. Проверь карточку синхронизации.'
        : 'Запись сохранена; запрос синхронизации обработан.');
    } catch {
      setStatus('Запись сохранена локально. Синхронизация ожидает соединения.');
    } finally { setBusy(false); }
  }
  return <section className="heroIdentity">
    <div className="heroIdentityIntro">
      <small>ПРОФИЛЬ · ОПРОС 76/76</small>
      <h3>Архетип и бренд</h3>
      <p><strong>{profile.publicBrand.direction}</strong> — пока рабочая гипотеза, а не подтверждённый экранный типаж.</p>
    </div>
    <div className="heroIdentityColumns">
      <div><strong>Основа личности</strong><p>{profile.core.values.join(' · ')}</p></div>
      <div><strong>Prime Mode</strong><p>{profile.prime.priorities.join(' · ')}</p></div>
      <div><strong>Стиль</strong><p>{profile.style.colors.join(' · ')}. Причёска пока не определена.</p></div>
      <div><strong>Актёрский диапазон</strong><p>Свобода перевоплощения {profile.actor.freedom}/10. Амплуа независимы от публичного образа.</p></div>
    </div>
    <div className="heroIdentityPractice">
      <h4>Практика · наблюдение</h4>
      <p>После упражнения зафиксируй ощущения. Это самооценка, а не объективный диагноз или оценка харизмы.</p>
      <label>Режим
        <select value={mode} onChange={e => setMode(e.target.value as HeroModeId)}>
          {modes.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </label>
      <label>Насколько естественно — {naturalness}/10
        <input type="range" min="1" max="10" value={naturalness} onChange={e => setNaturalness(Number(e.target.value))}/>
      </label>
      <label>Уверенность в моменте — {confidence}/10
        <input type="range" min="1" max="10" value={confidence} onChange={e => setConfidence(Number(e.target.value))}/>
      </label>
      <label>Короткое наблюдение
        <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Что получилось? Что было наигранным?"/>
      </label>
      <button type="button" disabled={busy} onClick={() => void record()}>{busy ? 'Сохраняю…' : 'Сохранить наблюдение'}</button>
      <small role="status">{status || 'Записей пока: ' + profile.exercises.length}</small>
    </div>
    {profile.exercises.length > 0 && <details className="heroIdentityHistory">
      <summary>История наблюдений · {profile.exercises.length}</summary>
      <ol>{[...profile.exercises].reverse().slice(0,10).map(e =>
        <li key={e.id}><b>{modes.find(m => m.id === e.mode)?.label}</b> · естественность {e.naturalness}/10 · уверенность {e.confidence}/10
          {e.note && <p>{e.note}</p>}</li>)}</ol>
    </details>}
  </section>;
}
