import { useEffect, useState } from 'react';
import { backendMode, resolveSyncConflicts } from './api';
import { readRuntimeConflicts, type RuntimeConflictResolution } from './runtimeSync';
import {
  getRuntimeSessionStatus,
  loginRuntimeSession,
  logoutRuntimeSession,
  type RuntimeSessionStatus,
} from './runtimeSession';

export default function RuntimeSyncCard({ onConnected }: { onConnected: () => void }) {
  const [status, setStatus] = useState<RuntimeSessionStatus | null>(null);
  const [passcode, setPasscode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflictCount, setConflictCount] = useState(0);

  useEffect(() => {
    if (backendMode !== 'remote') return;
    void refresh();
    refreshConflicts();
    const onSync = () => refreshConflicts();
    window.addEventListener('lifeos-runtime-sync', onSync);
    return () => window.removeEventListener('lifeos-runtime-sync', onSync);
  }, []);

  if (backendMode !== 'remote') return null;

  function refreshConflicts() {
    if (typeof localStorage === 'undefined') return;
    setConflictCount(readRuntimeConflicts(localStorage).length);
  }

  async function refresh() {
    try {
      setStatus(await getRuntimeSessionStatus());
      setError('');
    } catch (cause) {
      setError(String(cause));
    }
  }

  async function connect() {
    if (busy) return;
    setBusy(true);
    try {
      const next = await loginRuntimeSession(passcode);
      setStatus(next);
      setPasscode('');
      setError('');
      onConnected();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (busy) return;
    setBusy(true);
    try {
      await logoutRuntimeSession();
      setStatus({ configured: true, authenticated: false });
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function resolve(resolution: RuntimeConflictResolution) {
    if (busy) return;
    setBusy(true);
    try {
      await resolveSyncConflicts(resolution);
      refreshConflicts();
      setError('');
      onConnected();
    } catch (cause) {
      refreshConflicts();
      setError(cause instanceof Error ? cause.message : String(cause));
      onConnected();
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return <div className="runtimeCard"><span>Проверяю долговечную память…</span></div>;
  }

  if (!status.configured) {
    return (
      <div className="runtimeCard bad">
        <b>Серверная память не настроена</b>
        <span>Life OS продолжает работать офлайн, но межустройственная синхронизация пока выключена.</span>
      </div>
    );
  }

  if (status.authenticated && conflictCount > 0) {
    return (
      <div className="runtimeCard bad">
        <div>
          <b>Нужна сверка синхронизации</b>
          <span>
            {conflictCount === 1 ? '1 изменение' : `${conflictCount} изменения`} столкнулось с более новой версией на другом устройстве.
            Life OS уже показал актуальную серверную версию и ничего не перезаписывает без твоего выбора.
          </span>
        </div>
        <div className="runtimeActions">
          <button className="ghost" disabled={busy} onClick={() => void resolve('accept_remote')}>
            Оставить серверную
          </button>
          <button disabled={busy} onClick={() => void resolve('retry_local')}>
            Применить мою версию
          </button>
        </div>
        {error && <small className="runtimeError">{error}</small>}
      </div>
    );
  }

  if (status.authenticated) {
    return (
      <div className="runtimeCard ok">
        <div>
          <b>Долговечная память подключена</b>
          <span>Изменения сохраняются локально сразу и синхронизируются с canonical backend.</span>
        </div>
        <button className="ghost" disabled={busy} onClick={() => void disconnect()}>Отключить</button>
        {error && <small>{error}</small>}
      </div>
    );
  }

  return (
    <div className="runtimeCard">
      <b>Подключить долговечную память</b>
      <span>Код нужен только для создания защищённой HttpOnly-сессии и не сохраняется в браузере.</span>
      <div className="runtimeLogin">
        <input
          type="password"
          autoComplete="current-password"
          value={passcode}
          onChange={(event) => setPasscode(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') void connect(); }}
          placeholder="Код доступа"
        />
        <button disabled={busy || !passcode.trim()} onClick={() => void connect()}>
          {busy ? 'Подключаю…' : 'Подключить'}
        </button>
      </div>
      {error && <small className="runtimeError">{error}</small>}
    </div>
  );
}
