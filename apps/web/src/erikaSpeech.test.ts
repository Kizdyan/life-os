import { describe, expect, it } from 'vitest';
import { routeErikaSpeech } from './erikaSpeech';

describe('Erika speech mutation safety', () => {
  it('detects contextual copy rather than saving the instruction as a title', () => {
    expect(routeErikaSpeech('Сделай такую же задачу только на завтра')).toBe('copy-last-tomorrow');
    expect(routeErikaSpeech('Повтори ту же задачу завтра')).toBe('copy-last-tomorrow');
  });
  it('does not guess a referent or silently create on unsupported relative dates', () => {
    expect(routeErikaSpeech('Сделай такую же задачу')).toBe('clarify');
    expect(routeErikaSpeech('Перенеси эту же задачу на завтра')).toBe('clarify');
    expect(routeErikaSpeech('Завтра в час дня репетиция вокала')).toBe('clarify');
  });
  it('keeps explicit additions and existing-task actions distinct', () => {
    expect(routeErikaSpeech('Добавь репетицию в 13:00')).toBe('plan');
    expect(routeErikaSpeech('Не сделал репетицию вокала')).toBe('existing');
  });
});
