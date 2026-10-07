import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

describe('prototype v3 OpenAI credential contract', () => {
  it('keeps the deployed prototype source in the branch and reads only its dedicated secret', () => {
    expect(source).toContain('Deno.env.get("PERSONA_PROTOTYPE_OPENAI_API_KEY")');
    expect(source).not.toMatch(/Deno\.env\.get\(["']OPENAI_API_KEY["']\)/);
  });

  it('records safe credential shape and structured OpenAI errors without logging secret material', () => {
    expect(source).toContain('credentialShape');
    expect(source).toContain('prefixFamily');
    expect(source).toContain('trimmedChanged');
    expect(source).toContain('errorCode');
    expect(source).not.toContain('response.text()');
    expect(source).not.toContain('Authorization: `Bearer ${key}` },');
  });
});
