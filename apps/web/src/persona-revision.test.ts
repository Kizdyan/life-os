import { describe, expect, it } from 'vitest';
import { revisePersonaCarousel, readPersonaStyleMemory } from './persona-revision';
import { buildPersonaCarousel } from './persona-content';

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem() { throw new Error('Persona style memory must not read browser storage'); },
    setItem() { throw new Error('Persona style memory must not write browser storage'); },
  },
});

describe('Persona correction loop', () => {
  it('applies the current natural-language correction without browser persistence', () => {
    const before = buildPersonaCarousel('actor');
    const after = revisePersonaCarousel(before, 'Сделай текста меньше и заголовки короче');
    expect(after.slides[0].body.length).toBeLessThan(before.slides[0].body.length);
    expect(after.slides[0].title.length).toBeLessThanOrEqual(before.slides[0].title.length);
  });

  it('has no legacy browser-backed style memory source', () => {
    expect(readPersonaStyleMemory()).toEqual([]);
  });
});
