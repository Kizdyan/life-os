import { useEffect, useMemo, useState } from 'react';
import { newSleepEntry, readSleepEntry, sleepSummary, suggestedSleepWindows } from './sleepEnergy';
import { persistSleepMeasurement, syncSleepRuntime } from './sleepRuntime';

export default function SleepEnergyCard({ date }: { date: string }) {
  const existing = typeof localStorage === 'undefined' ? null : readSleepEntry(localStorage, date);
  const [hours, setHours] = useState(existing ? String(existing.durationMinutes / 60) : '7');
  const [energy, setEnergy] = useState(existing?.energy ?? 5);
  const [quality, setQuality] = useState(existing?.sleepQuality ?? 5);
  const [selected, setSelected] = useState(existing ? `${existing.sleepStart}–${existing.wakeTime}` : '');
  const [saved, setSaved] = useState(Boolean(existing));
  const [error, setError] = useState('');

  const minutes = Math.round(Number(hours.replace(',', '.')) * 60);
  const windows = useMemo(() => suggestedSleepWindows(minutes), [minutes]);
  const summary = typeof localStorage === 'undefined' ? { count: 0, averageHours: 0, averageEnergy: 0 } : sleepSummary(localStorage);

  function hydrateFromLocal() {
    if (typeof localStorage === 'undefined') return;
    const latest = readSleepEntry(localStorage, date);
    if (!latest) return;
    setHours(String(latest.durationMinutes / 60));
    setEnergy(latest.energy);
    setQuality(latest.sleepQuality ?? 5);
    setSelected(`${latest.sleepStart}–${latest.wakeTime}`);
    setSaved(true);
  }

  useEffect(() => {
    const synced = () => hydrateFromLocal();
    window.addEventListener('lifeos-runtime-sync', synced);
    void syncSleepRuntime().then(hydrateFromLocal).catch(() => undefined);
    return () => window.removeEventListener('lifeos-runtime-sync', synced);
  }, [date]);

  async function persist() {
    const numericHours = Number(hours.replace(',', '.'));
    const sleepWindow = windows.find((candidate) => candidate.label === selected) ?? windows[0];
    if (!sleepWindow) { setError('Сначала укажи длительность сна'); return; }
    try {
      const latest = typeof localStorage === 'undefined' ? null : readSleepEntry(localStorage, date);
      const entry = newSleepEntry(
        { date, hours: numericHours, window: sleepWindow, energy, sleepQuality: quality },
        new Date().toISOString(),
        latest?.id,
      );
      await persistSleepMeasurement({ ...entry, version: latest?.version });
      setSelected(sleepWindow.label);
      setSaved(true);
      setError('');
      window.dispatchEvent(new Event('lifeos-life-sensor'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <section className='sensorCard'>
      <div className='sensorHead'><div><small>LIFE TRACKER · СЕНСОР</small><h2>Сон и энергия</h2></div>{saved && <span className='sensorSaved'>Сохранено</span>}</div>
      <div className='sensorGrid'>
        <label>Сколько спал<input inputMode='decimal' value={hours} onChange={(event) => { setHours(event.target.value); setSaved(false); }} /><span>часов</span></label>
        <label>Энергия утром<strong>{energy}/10</strong><input type='range' min='1' max='10' value={energy} onChange={(event) => { setEnergy(Number(event.target.value)); setSaved(false); }} /></label>
        <label>Качество сна<strong>{quality}/10</strong><input type='range' min='1' max='10' value={quality} onChange={(event) => { setQuality(Number(event.target.value)); setSaved(false); }} /></label>
      </div>
      <div className='sleepWindows'><small>Когда именно спал</small><div>{windows.map((window) => <button key={window.label} className={selected === window.label ? 'selected' : ''} onClick={() => { setSelected(window.label); setSaved(false); }}>{window.label}</button>)}</div></div>
      <button className='sensorSave' onClick={() => void persist()}>Сохранить измерение</button>
      {error && <small className='runtimeError'>{error}</small>}
      {summary.count >= 2 && <p className='sensorInsight'>За {summary.count} записей: в среднем {summary.averageHours} ч сна · энергия {summary.averageEnergy}/10. Когда накопится больше данных, Analytics начнёт сравнивать время сна, энергию и выполнение графика.</p>}
    </section>
  );
}
