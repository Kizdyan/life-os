import type { Item } from './types';
import type { PlanInput } from './api';

export function createContextualCopy(source: Item, targetDate: string): { idempotencyKey: string; items: PlanInput[] } {
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(targetDate);
  if (!parsed) throw new Error('Некорректная дата для копии.');
  const [y,m,d] = parsed.slice(1).map(Number);
  const checked = new Date(Date.UTC(y, m-1, d));
  if (checked.getUTCFullYear() !== y || checked.getUTCMonth() !== m-1 || checked.getUTCDate() !== d)
    throw new Error('Некорректная календарная дата.');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(source.planned_start || ''))
    throw new Error('У исходной задачи нет достоверного времени.');
  if (source.planned_end && source.planned_end.slice(0,10) !== source.planned_start!.slice(0,10))
    throw new Error('Для задачи через полночь требуется уточнение времени.');

  return {
    idempotencyKey: `erika-copy:${source.id}:${targetDate}`,
    items: [{
      title: source.title,
      kind: source.kind,
      planned_start: targetDate + source.planned_start!.slice(10),
      planned_end: source.planned_end ? targetDate + source.planned_end.slice(10) : null,
    }],
  };
}
