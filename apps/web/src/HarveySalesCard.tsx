import { useState } from 'react';
import {
  previewHarveyProspectsCsv,
  type HarveyReviewPreview,
} from '../../../packages/core/src/harvey-prospect-review';
import { saveHarveyReviewTasks } from './harvey';

export default function HarveySalesCard({ onAdded }: { onAdded: () => void }) {
  const [preview, setPreview] = useState<HarveyReviewPreview | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);

  async function readFile(file: File | undefined) {
    setError('');
    setSaved('');
    setPreview(null);
    if (!file) return;
    try {
      if (file.size > 256000) throw new Error('CSV слишком большой (макс. 256 КБ)');
      const csv = await file.text();
      const result = previewHarveyProspectsCsv(csv, {
        projectId: 'sales-opportunities',
        now: new Date().toISOString(),
        maxNewTasks: 10,
      });
      setPreview(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось прочитать CSV');
    }
  }

  async function save() {
    if (!preview?.reviewTasks.length || busy || saved) return;
    setBusy(true);
    setError('');
    try {
      const count = await saveHarveyReviewTasks(preview.reviewTasks);
      setSaved(count === null
        ? 'Заявки обработаны в хранилище Life OS. Повторный импорт не перезаписывает задачи.'
        : `Добавлено задач: ${count}. Повторный импорт не создаёт дубликаты.`);
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Импорт не выполнен');
    } finally {
      setBusy(false);
    }
  }

  return <aside className="harveyCard" aria-label="Harvey — заказчики">
    <div className="harveyHead">
      <div><small>HARVEY · ПРОБНЫЙ РЕЖИМ</small><b>Поиск заказчиков</b></div>
      <span>Без рассылки</span>
    </div>
    <p>Загрузи CSV, выгруженный из Harvey. Компании появятся на проверку в задачах Life OS. Почта не подключается, сообщения не отправляются.</p>
    <label className="harveyFile">
      Выбрать CSV с компаниями
      <input type="file" accept=".csv,text/csv" onChange={e => void readFile(e.target.files?.[0])} />
    </label>
    {preview && <>
      <p className="harveyStats">
        Подходящих компаний: {preview.companies.length} · исключено записей: {preview.skipped.length}
      </p>
      {preview.companies.length > 0 && <ul className="harveyList">
        {preview.companies.map(company => <li key={company.domain}>
          <b>{company.companyName}</b>
          <span>{company.domain} · оценка Harvey: {company.harveyScore}</span>
        </li>)}
      </ul>}
      <button className="harveySave" onClick={() => void save()}
        disabled={busy || Boolean(saved) || preview.reviewTasks.length === 0}>
        {busy ? 'Сохраняю…' : 'Добавить в задачи на проверку'}
      </button>
    </>}
    {saved && <p role="status" className="harveySuccess">{saved}</p>}
    {error && <p role="alert" className="harveyError">{error}</p>}
    <small>Оценки Harvey не являются подтверждением качества клиента или согласием на рекламу.</small>
  </aside>;
}
