import { describe, expect, it } from 'vitest';
import { createQuickCapture } from './quickCapture';

describe('quick task capture contract', () => {
  it('creates a stable, normalized local plan request', () => {
    expect(createQuickCapture({ title: '  Репетиция   вокала ', date: '2026-10-19', time: '09:30' })).toEqual({
      idempotencyKey: 'quick-capture:2026-10-19:09:30:репетиция вокала',
      items: [{ title: 'Репетиция вокала', kind: 'task', planned_start: '2026-10-19T09:30:00+03:00', planned_end: null }],
    });
  });
  it.each([
    { title: '   ', date: '2026-10-19', time: '09:30', error: 'Введите название задачи' },
    { title: 'Репетиция', date: '19-10-2026', time: '09:30', error: 'Укажите корректную дату' },
    { title: 'Репетиция', date: '2026-10-19', time: '25:30', error: 'Укажите корректное время' },
  ])('rejects invalid user input before any write', ({ title, date, time, error }) => {
    expect(() => createQuickCapture({ title, date, time })).toThrow(error);
  });
});
