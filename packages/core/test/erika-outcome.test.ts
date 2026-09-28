import { describe, expect, it } from 'vitest';
import { parseErikaOutcome } from '../src/erika-outcome';

describe('Erika outcome commands', () => {
  it('uses the same outcome command as UI for completion', () => {
    expect(parseErikaOutcome('Теорию музыки сделал', 'music', '2026-09-30', '2026-10-01')?.command).toBe('complete');
  });

  it('marks today missed and requests carry-forward when asked for tomorrow', () => {
    const parsed = parseErikaOutcome('Теорию музыки не сделал, перенеси на завтра', 'music', '2026-09-30', '2026-10-01');
    expect(parsed?.command).toBe('not_complete');
    expect(parsed?.carryForward).toBe(true);
    expect(parsed?.nextDate).toBe('2026-10-01');
  });
});
