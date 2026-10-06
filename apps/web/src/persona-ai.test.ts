import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reviseWithAI } from './persona-ai';
import type { PersonaCarouselDraft } from './persona-content';

const draft: PersonaCarouselDraft = {
  topicId: 'musical',
  title: 'Черновик',
  slides: [{ eyebrow: 'МУЗЫКА', title: 'Заголовок', body: 'Текст' }],
  caption: 'Подпись',
  platformNotes: { instagram: '', vk: '', youtube: '' },
};

beforeEach(() => {
  const memory = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.set(k, v),
    removeItem: (k: string) => void memory.delete(k),
    clear: () => memory.clear(),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('semantic Persona revisions', () => {
  it('does not pretend to understand a correction with local keyword heuristics when AI is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'ai_not_configured' }) }));
    await expect(reviseWithAI(draft, 'Сделай совсем по-другому и перестрой логику карточек')).rejects.toThrow(/AI/i);
  });

  it('accepts a complete semantic rewrite returned by the editor', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        title: 'Новый заголовок',
        slides: [{ eyebrow: 'МУЗЫКА', title: 'Новая мысль', body: 'Новый текст' }],
        caption: 'Новая подпись',
        platformNotes: { instagram: 'IG', vk: 'VK', youtube: 'YT' },
        learnedRules: ['Не перегружать первый экран'],
        changeSummary: 'Полностью перестроена логика.',
      }),
    }));
    const result = await reviseWithAI(draft, 'Перестрой материал целиком');
    expect(result.draft.title).toBe('Новый заголовок');
    expect(result.summary).toContain('перестроена');
    expect(result.rules).toContain('Не перегружать первый экран');
  });

  it('uses durable server memory and never reads or writes browser memory', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('browser memory must not be read'); },
      setItem: () => { throw new Error('browser memory must not be written'); },
    });
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url === '/api/media/memory' && (!init || init.method !== 'POST')) {
        return { ok: true, json: async () => ({ rules: ['Durable rule'], durable: true }) } as Response;
      }
      if (url === '/api/media/status') {
        return { ok: true, json: async () => ({
          title: 'Новый заголовок',
          slides: [{ eyebrow: 'МУЗЫКА', title: 'Новая мысль', body: 'Новый текст' }],
          caption: 'Новая подпись',
          platformNotes: { instagram: 'IG', vk: 'VK', youtube: 'YT' },
          learnedRules: ['Явная новая правка'],
          changeSummary: 'Готово.',
        }) } as Response;
      }
      if (url === '/api/media/memory' && init?.method === 'POST') {
        return { ok: true, json: async () => ({ rules: ['Durable rule', 'Явная новая правка'], durable: true }) } as Response;
      }
      throw new Error(`unexpected fetch ${url}`);
    }));

    await reviseWithAI(draft, 'Сделай заголовки короче');

    const aiBody = JSON.parse(String(calls.find(call => call.url === '/api/media/status')?.init?.body));
    expect(aiBody.memory).toEqual(['Durable rule']);
    const memoryBody = JSON.parse(String(calls.find(call => call.url === '/api/media/memory' && call.init?.method === 'POST')?.init?.body));
    expect(memoryBody).toEqual({ rules: ['Явная новая правка'], source: 'explicit' });
  });
});
