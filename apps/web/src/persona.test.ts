import { describe, expect, it } from 'vitest';
import { decidePersona, readPersonaQueue } from './persona';

describe('Persona approval center API', () => {
  it('reads a compact decision queue', async () => {
    const queue = await readPersonaQueue({ baseUrl: '/api', fetchImpl: async () => new Response(JSON.stringify({ items: [{ candidateId: 'c1', title: 'После репетиции', rationale: 'Живой backstage', platforms: ['instagram', 'vk'], previewUrl: null, revision: 2 }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }) });
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ candidateId: 'c1', title: 'После репетиции', revision: 2 });
  });

  it('sends only the four supported user decisions', async () => {
    let body = '';
    await decidePersona('c1', 'approved', null, { baseUrl: '/api', fetchImpl: async (_url, init) => { body = String(init?.body ?? ''); return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }); } });
    expect(JSON.parse(body)).toEqual({ decision: 'approved', reason: null });
    await expect(decidePersona('c1', 'unknown' as never, null, { baseUrl: '/api', fetchImpl: async () => new Response('{}') })).rejects.toThrow('Unsupported Persona decision');
  });
});
