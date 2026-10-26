import React, { useState } from 'react';
import type { Item } from './types';
import { editLocalTask, type LocalEdit } from './localRuntime';
import { planLocalDate, planLocalDateTime } from './planner';

interface Props {
  item: Item;
  onCancel: () => void;
  onSaved: (item: Item) => void;
}

export default function LocalTaskEditor({ item, onCancel, onSaved }: Props) {
  const [title, setTitle] = useState(item.title);
  const [date, setDate] = useState(item.planned_start?.slice(0, 10) || planLocalDate(new Date()));
  const [start, setStart] = useState(item.planned_start?.slice(11, 16) || '09:00');
  const [end, setEnd] = useState(item.planned_end?.slice(11, 16) || '');
  const [error, setError] = useState('');

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error('Выбери корректную дату.');
      if (!/^\d{2}:\d{2}$/.test(start) || (end && !/^\d{2}:\d{2}$/.test(end)))
        throw Error('Укажи время в формате ЧЧ:ММ.');
      const edit: LocalEdit = {
        title: title.trim(),
        planned_start: planLocalDateTime(date, start),
        planned_end: end ? planLocalDateTime(date, end) : null,
      };
      const saved = editLocalTask(localStorage, item.id, edit);
      onSaved(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить изменение.');
    }
  }

  return <div className="sheetBackdrop" onClick={onCancel}>
    <div className="sheet taskEditor" role="dialog" aria-modal="true"
      aria-labelledby="taskEditorTitle" onClick={event => event.stopPropagation()}>
      <div className="sheetHead">
        <b id="taskEditorTitle">Изменить задачу</b>
        <button aria-label="Закрыть редактор" onClick={onCancel}>×</button>
      </div>
      <form onSubmit={save}>
        <label>Название
          <input autoFocus required maxLength={1000} value={title}
            onChange={event => setTitle(event.target.value)} />
        </label>
        <label>Дата
          <input type="date" required value={date}
            onChange={event => setDate(event.target.value)} />
        </label>
        <div className="taskEditorTimes">
          <label>Начало
            <input type="time" required value={start}
              onChange={event => setStart(event.target.value)} />
          </label>
          <label>Окончание (необязательно)
            <input type="time" value={end}
              onChange={event => setEnd(event.target.value)} />
          </label>
        </div>
        <p className="editorHint">Время определяется часовым поясом устройства. Пересечения с другими запланированными задачами проверяются до сохранения.</p>
        {error && <p role="alert" className="error">{error}</p>}
        <div className="taskEditorActions">
          <button type="button" onClick={onCancel}>Отмена</button>
          <button className="primary" type="submit">Сохранить изменения</button>
        </div>
      </form>
    </div>
  </div>;
}
