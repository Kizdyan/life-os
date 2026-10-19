import type { PlanInput } from './api';

export type QuickCaptureInput = { title: string; date: string; time: string };

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function createQuickCapture(input: QuickCaptureInput): { idempotencyKey: string; items: PlanInput[] } {
  const title = input.title.trim().replace(/\s+/g, ' ');
  if (!title) throw new Error('Введите название задачи');
  if (!datePattern.test(input.date)) throw new Error('Укажите корректную дату');
  if (!timePattern.test(input.time)) throw new Error('Укажите корректное время');

  const normalizedTitle = title.toLocaleLowerCase('ru-RU');
  return {
    idempotencyKey: `quick-capture:${input.date}:${input.time}:${normalizedTitle}`,
    items: [{ title, kind: 'task', planned_start: `${input.date}T${input.time}:00+03:00`, planned_end: null }],
  };
}
