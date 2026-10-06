import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Persona runtime routing', () => {
  it('routes Persona JSON entrypoints through the durable runtime wrapper', async () => {
    const config = JSON.parse(await readFile(new URL('../../vercel.json', import.meta.url), 'utf8')) as {
      rewrites?: Array<{ source?: string; destination?: string }>;
    };
    const rewrites = new Map((config.rewrites ?? []).map(item => [item.source, item.destination]));

    expect(rewrites.get('/api/media/status')).toBe('/api/media/persona-runtime');
    expect(rewrites.get('/api/persona')).toBe('/api/media/persona-runtime');
  });
});
