import { describe, expect, it } from 'vitest';
import handler from './persona-v3.js';

describe('public Persona v3 entrypoint', () => {
  it('exposes the autonomous content pipeline rather than legacy status', async () => {
    const response = await handler.fetch(new Request('https://life-os.test/api/persona'));
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body.pipelineVersion).toBe(3);
    expect(typeof body.personaAI).toBe('boolean');
    expect(body).not.toHaveProperty('digest');
    expect(body).not.toHaveProperty('autonomousReady');
  });
});
